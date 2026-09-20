/**
 * Phase 0 桶体检：对真实 MinIO 桶做只读探查，核对画廊同步引擎的假设。
 *   npm run inspect-bucket
 * 输出：各前缀对象数、最新 manifest 的结构样本、thumbs 命名样本、
 *       随机一张原图的格式/尺寸/EXIF 提取结果。
 */
import "dotenv/config";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const bucket = process.env.MINIO_BUCKET ?? "wallpapers";
if (!process.env.MINIO_ENDPOINT) {
  console.error("请先在 .env 配置 MINIO_*（参考 .env.example）");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? 9000}`,
  region: process.env.MINIO_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
});

async function list(prefix, max = 2000) {
  const keys = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && keys.length < max);
  return keys;
}

async function get(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

console.log(`== 桶 ${bucket} 体检 ==`);

for (const prefix of ["objects/", "thumbs/", "manifests/", "display/"]) {
  const keys = await list(prefix);
  console.log(`\n[${prefix}] ${keys.length} 个对象`);
  for (const k of keys.slice(0, 3)) console.log("   ", k);
  if (keys.length > 3) console.log("    …");
}

// manifest 结构样本：取每个设备最新
const manifestKeys = await list("manifests/");
const latestByDevice = new Map();
for (const k of manifestKeys) {
  const base = k.replace(/^manifests\//, "").replace(/\.json$/, "");
  const idx = base.lastIndexOf("-");
  if (idx <= 0) continue;
  const device = base.slice(0, idx);
  const ts = Number(base.slice(idx + 1));
  const prev = latestByDevice.get(device);
  if (!prev || ts > prev.ts) latestByDevice.set(device, { key: k, ts });
}
console.log(`\n[manifests] ${latestByDevice.size} 台设备的最新快照`);
for (const [device, { key }] of latestByDevice) {
  const buf = await get(key);
  let json;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    console.log(`  ${device}: JSON 解析失败！`);
    continue;
  }
  console.log(`  ${device} → ${key}`);
  console.log(`    顶层键: ${Object.keys(json).join(", ")}`);
  const preview = JSON.stringify(json).slice(0, 800);
  console.log(`    内容预览: ${preview}${JSON.stringify(json).length > 800 ? " …" : ""}`);
}

// 原图样本：EXIF 可提取性
const objectKeys = await list("objects/");
if (objectKeys.length > 0) {
  const sampleKey = objectKeys[Math.floor(objectKeys.length / 2)];
  const buf = await get(sampleKey);
  const { default: exifr } = await import("exifr");
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  let exifSummary = "（无 EXIF）";
  try {
    const exif = await exifr.parse(buf, {
      pick: ["DateTimeOriginal", "Make", "Model", "LensModel", "ISO", "ExposureTime", "FNumber", "FocalLength"],
    });
    if (exif) exifSummary = JSON.stringify(exif);
  } catch (err) {
    exifSummary = `解析失败: ${err.message}`;
  }
  console.log(`\n[objects 样本] ${sampleKey}`);
  console.log(`    尺寸: ${meta.width}×${meta.height}  格式: ${meta.format}`);
  console.log(`    EXIF: ${exifSummary}`);
}

console.log("\n体检完成。核对点：manifest 顶层是否含 items 数组与 hash 字段；thumbs 命名是否 <id>_<hash8>.webp；EXIF 是否完整。");
