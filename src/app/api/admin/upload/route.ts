import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { displayKey, originalKey } from "@/lib/bucket-layout";
import { prisma } from "@/lib/db";
import { extractExif } from "@/lib/exif";
import { reverseGeocode } from "@/lib/geo";
import { generateDisplay } from "@/lib/image-pipeline";
import { putBuffer } from "@/lib/s3";
import { sniffImage } from "@/lib/sniff";

export const runtime = "nodejs";

interface UploadOutcome {
  fileName: string;
  sha1: string;
  status: "created" | "exists" | "error";
  error?: string;
}

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const formData = await request.formData().catch(() => null);
  const files = formData?.getAll("files");
  if (!files?.length) return badRequest("缺少 files");

  const outcomes: UploadOutcome[] = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
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
      if (exif?.gps) {
        const location = await reverseGeocode(exif.gps);
        if (location) exif.gps.location = location;
      }
      let width: number | undefined;
      let height: number | undefined;
      let webp: Buffer | null = null;
      try {
        const result = await generateDisplay(buf);
        webp = result.webp;
        width = result.width;
        height = result.height;
      } catch (err) {
        console.warn(`[upload] display 生成失败 ${file.name}:`, err instanceof Error ? err.message : err);
      }

      // 与壁纸软件的内容寻址约定一致：原图原样存 objects/<sha1>
      await putBuffer(originalKey(sha1), buf, sniff.mimeType);
      if (webp) await putBuffer(displayKey(sha1), webp, "image/webp");

      const fileName = /\.[A-Za-z0-9]{2,5}$/.test(file.name) ? file.name : `${file.name}.${sniff.format.toLowerCase()}`;
      await prisma.photo.create({
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
      });
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
