import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { displayKey, originalKey } from "@/lib/bucket-layout";
import { prisma } from "@/lib/db";
import { extractExif } from "@/lib/exif";
import type { GeoPoint, NormalizedExif } from "@/lib/exif";
import { reverseGeocode } from "@/lib/geo";
import { generateDisplay } from "@/lib/image-pipeline";
import { createLogger } from "@/lib/logger";
import { putBuffer } from "@/lib/s3";
import { sniffImage } from "@/lib/sniff";

export const runtime = "nodejs";

const logger = createLogger("upload");

/** 单文件与单次请求上限：整图会读进 Buffer，无上限时一次大批量上传能打满内存 */
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;

interface UploadOutcome {
  fileName: string;
  sha1: string;
  status: "created" | "exists" | "error";
  error?: string;
}

/**
 * 地名反查放到入库之后异步补写：reverseGeocode 有 1s 节流且依赖外部服务，
 * 串在上传链路里会让多图上传一直卡在等待里。
 */
async function backfillLocation(photoId: number, gps: GeoPoint): Promise<void> {
  try {
    const location = await reverseGeocode(gps);
    if (!location) return;
    const row = await prisma.photo.findUnique({ where: { id: photoId }, select: { exif: true } });
    const exif = row?.exif as NormalizedExif | null | undefined;
    if (!exif?.gps || exif.gps.location) return;
    await prisma.photo.update({
      where: { id: photoId },
      data: { exif: { ...exif, gps: { ...exif.gps, location } } as unknown as object },
    });
  } catch (err) {
    logger.warn(`地名回填失败 photoId=${photoId}`, err);
  }
}

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const formData = await request.formData().catch(() => null);
  const files = (formData?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return badRequest("缺少 files");
  if (files.length > MAX_FILES_PER_REQUEST) {
    return badRequest(`单次最多上传 ${MAX_FILES_PER_REQUEST} 个文件`);
  }

  const outcomes: UploadOutcome[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      outcomes.push({
        fileName: file.name,
        sha1: "",
        status: "error",
        error: `文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限`,
      });
      continue;
    }
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const sha1 = createHash("sha1").update(buf).digest("hex");

      const existing = await prisma.photo.findUnique({ where: { sha1 } });
      if (existing) {
        outcomes.push({ fileName: file.name, sha1, status: "exists" });
        continue;
      }

      const sniff = sniffImage(buf);
      if (sniff.format === "UNKNOWN") {
        outcomes.push({ fileName: file.name, sha1, status: "error", error: "无法识别的图片格式" });
        continue;
      }

      const exif = await extractExif(buf);
      let width: number | undefined;
      let height: number | undefined;
      let webp: Buffer | null = null;
      try {
        const result = await generateDisplay(buf);
        webp = result.webp;
        width = result.width;
        height = result.height;
      } catch (err) {
        logger.warn(`display 生成失败 ${file.name}`, err);
      }

      // 与壁纸软件的内容寻址约定一致：原图原样存 objects/<sha1>
      await putBuffer(originalKey(sha1), buf, sniff.mimeType);
      if (webp) await putBuffer(displayKey(sha1), webp, "image/webp");

      const fileName = /\.[A-Za-z0-9]{2,5}$/.test(file.name) ? file.name : `${file.name}.${sniff.format.toLowerCase()}`;
      const created = await prisma.photo.create({
        data: {
          sha1,
          source: "UPLOAD",
          title: file.name.replace(/\.[^.]+$/, "") || sha1.slice(0, 12),
          fileName,
          storageKey: originalKey(sha1),
          mimeType: sniff.mimeType,
          format: sniff.format,
          fileSize: BigInt(buf.length),
          width: width ?? null,
          height: height ?? null,
          published: false,
          shotAt: exif?.shotAt ? new Date(exif.shotAt) : null,
          exif: exif ? (exif as unknown as object) : undefined,
        },
        select: { id: true },
      });
      if (exif?.gps) void backfillLocation(created.id, exif.gps);
      outcomes.push({ fileName: file.name, sha1, status: "created" });
    } catch (err) {
      outcomes.push({
        fileName: file.name,
        sha1: "",
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return json({ outcomes });
}
