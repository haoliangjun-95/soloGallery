/**
 * 伪壁纸桶夹具：s3rver 内存 S3 + 按“壁纸软件约定”写入
 * objects/<sha1>、thumbs/<id>_<hash8>.webp、manifests/<uuid>-<ts>.json。
 * manifest 采用 2026-09 对 vividdeck 真实桶体检确认的 schema：
 * { version, updatedAt(ms), updatedBy, images[], categories[], tombstones[] }
 * 供 fake-bucket.mjs（手动探查）与 e2e-sync.mts（自动断言）共用。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import S3rver from "s3rver";
import AWSAccount from "s3rver/lib/models/account.js";
import sharp from "sharp";
import piexif from "piexifjs";
import {
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const BUCKET = process.env.MINIO_BUCKET ?? "wallpapers";

const CAT_SCENERY = "cat-scenery";
const CAT_CITY = "cat-city";

const EXIF_SAMPLES = [
  {
    Make: "Canon", Model: "Canon EOS R6m2", LensModel: "RF24-105mm F4 L IS USM",
    ISO: 100, ExposureTime: [1, 160], FNumber: [4, 1], FocalLength: [63, 1],
    DateTimeOriginal: "2026:02:12 15:55:00",
  },
  {
    Make: "SONY", Model: "ILCE-7M4", LensModel: "FE 24-70mm F2.8 GM II",
    ISO: 400, ExposureTime: [1, 250], FNumber: [28, 10], FocalLength: [50, 1],
    DateTimeOriginal: "2025:11:03 09:20:00",
  },
  {
    Make: "Apple", Model: "iPhone 15 Pro", LensModel: "iPhone 15 Pro back triple camera 6.86mm f/1.78",
    ISO: 64, ExposureTime: [1, 120], FNumber: [178, 100], FocalLength: [6, 1],
    DateTimeOriginal: "2026:01:20 18:42:00",
  },
];

function withExif(jpegBuf, sample) {
  const exifObj = {
    "0th": {
      [piexif.ImageIFD.Make]: sample.Make,
      [piexif.ImageIFD.Model]: sample.Model,
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: sample.DateTimeOriginal,
      [piexif.ExifIFD.LensModel]: sample.LensModel,
      [piexif.ExifIFD.ISOSpeedRatings]: sample.ISO,
      [piexif.ExifIFD.ExposureTime]: sample.ExposureTime,
      [piexif.ExifIFD.FNumber]: sample.FNumber,
      [piexif.ExifIFD.FocalLength]: sample.FocalLength,
    },
    GPS: {},
  };
  const exifStr = piexif.dump(exifObj);
  return Buffer.from(piexif.insert(exifStr, jpegBuf.toString("binary")), "binary");
}

async function makeJpeg(i) {
  const w = i % 2 === 0 ? 1350 : 900;
  const h = i % 2 === 0 ? 900 : 1350;
  const hue = (i * 47) % 360;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${hue},70%,55%)"/>` +
      `<stop offset="1" stop-color="hsl(${(hue + 60) % 360},60%,28%)"/>` +
      `</linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
      `<text x="${w / 2}" y="${h / 2}" font-size="120" fill="rgba(255,255,255,.8)" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${i + 1}</text>` +
      `</svg>`,
  );
  const jpeg = await sharp(svg).jpeg({ quality: 90 }).toBuffer();
  return { jpeg: withExif(jpeg, EXIF_SAMPLES[i % EXIF_SAMPLES.length]), width: w, height: h };
}

async function buildItem(id, num, categoryId, tags, favorite) {
  const { jpeg, width, height } = await makeJpeg(num - 1);
  const hash = crypto.createHash("sha1").update(jpeg).digest("hex");
  return {
    id,
    fileName: `DSC_${1000 + num}.jpg`,
    hash,
    jpeg,
    width,
    height,
    sizeBytes: jpeg.length,
    format: "jpg",
    categoryId,
    tags,
    favorite,
    addedAt: Date.now() - (10 - num) * 3600_000,
    updatedAt: Date.now() - (9 - num) * 3600_000,
    updatedBy: "",
  };
}

/** 8 张图，id w1..w8，前 4 张属“风景”，后 4 张属“城市”。 */
export async function buildItems() {
  const items = [];
  for (let i = 1; i <= 8; i++) {
    items.push(
      await buildItem(
        `w${i}`,
        i,
        i <= 4 ? CAT_SCENERY : CAT_CITY,
        i % 2 === 1 ? ["风景"] : ["风景", "城市"],
        i % 3 === 0,
      ),
    );
  }
  return items;
}

/** 额外生成一张新图（phase2 新增场景用）。 */
export async function makeExtraItem(id = "w9") {
  return buildItem(id, 9, CAT_CITY, ["夜色"], false);
}

export const CATEGORIES = [
  { id: CAT_SCENERY, name: "风景", createdAt: Date.now() - 86400_000, updatedAt: Date.now() - 86400_000 },
  { id: CAT_CITY, name: "城市", createdAt: Date.now() - 86400_000, updatedAt: Date.now() - 86400_000 },
];

function toImage(it, device) {
  return {
    id: it.id,
    fileName: it.fileName,
    hash: it.hash,
    width: it.width,
    height: it.height,
    sizeBytes: it.sizeBytes,
    format: it.format,
    categoryId: it.categoryId,
    tags: it.tags,
    favorite: it.favorite,
    addedAt: it.addedAt,
    updatedAt: it.updatedAt,
    updatedBy: device,
  };
}

/** 阶段一：两台设备的清单（w5-w8 为 B 独有视角，B 给自己的副本追加了“旅行”标签）。 */
export function phase1Manifests(items) {
  const t0 = Date.now();
  const deviceA = "11111111-aaaa-4bbb-8ccc-000000000001";
  const deviceB = "22222222-aaaa-4bbb-8ccc-000000000002";
  const mk = (device, arr, extraTags = []) => ({
    version: 1,
    updatedAt: t0,
    updatedBy: device,
    images: arr.map((it) => ({
      ...toImage(it, device),
      tags: [...new Set([...it.tags, ...extraTags])],
      favorite: it.favorite || extraTags.length > 0,
    })),
    categories: CATEGORIES,
    tombstones: [],
  });
  return [
    { device: deviceA, ts: t0, json: mk(deviceA, items.slice(0, 6)) },
    { device: deviceB, ts: t0 + 500, json: mk(deviceB, items.slice(4), ["旅行"]) },
  ];
}

/** 阶段二：deviceA 更新清单——tombstone 掉 w2（按 id，独立数组），并新增 w9。 */
export async function phase2Manifest(items, makeNewItem) {
  const deviceA = "11111111-aaaa-4bbb-8ccc-000000000001";
  const t1 = Date.now() + 60_000;
  const newItem = await makeNewItem();
  const base = items.slice(0, 6).filter((it) => it.id !== "w2").map((it) => toImage(it, deviceA));
  return {
    device: deviceA,
    ts: t1,
    json: {
      version: 1,
      updatedAt: t1,
      updatedBy: deviceA,
      images: [...base, toImage(newItem, deviceA)],
      categories: CATEGORIES,
      tombstones: [{ id: "w2", kind: "image", deletedAt: t1 + 1000, deletedBy: deviceA }],
    },
    newItem,
  };
}

export async function startFakeBucket(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solog-e2e-"));
  const s3rver = new S3rver({
    port,
    address: "127.0.0.1",
    silent: true,
    directory: dir,
  });
  await s3rver.run(); // promise 形式返回的是 address()，server 挂在实例上

  const client = new S3Client({
    endpoint: `http://127.0.0.1:${port}`,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "e2e", secretAccessKey: "e2e" },
  });
  // s3rver v3 要求先注册账号密钥对，否则所有签名请求报 InvalidAccessKeyId
  new AWSAccount("solog-e2e").createKeyPair("e2e", "e2e");
  await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
  return {
    client,
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
    },
    async stop() {
      await new Promise((resolve) => s3rver.close(() => resolve()));
    },
  };
}

/** 按壁纸软件约定写入：objects + thumbs + manifests。 */
export async function seedObjects(ctx, items) {
  for (const it of items) {
    await ctx.put(`objects/${it.hash}`, it.jpeg, "image/jpeg");
    const thumb = await sharp(it.jpeg).resize({ width: 400 }).webp({ quality: 80 }).toBuffer();
    await ctx.put(`thumbs/${it.id}_${it.hash.slice(0, 8)}.webp`, thumb, "image/webp");
  }
}

export async function seedManifests(ctx, manifests) {
  for (const m of manifests) {
    await ctx.put(`manifests/${m.device}-${m.ts}.json`, Buffer.from(JSON.stringify(m.json)), "application/json");
  }
}
