import { NextRequest } from "next/server";
import sharp from "sharp";
import { guardAdmin, badRequest, json } from "@/lib/api";
import { publicUrl } from "@/lib/config";
import { putBuffer } from "@/lib/s3";
import { setSettings } from "@/lib/settings";
import { sniffImage } from "@/lib/sniff";

export const runtime = "nodejs";

/** 站点 Logo：固定 key 存 display/__site/logo（该前缀公共读），最长边压到 256。 */
const LOGO_KEY = "display/__site/logo";

export async function POST(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return badRequest("缺少 file");

  const buf = Buffer.from(await file.arrayBuffer());
  const sniff = sniffImage(buf);
  if (sniff.format === "UNKNOWN") return badRequest("无法识别的图片格式");
  if (sniff.format === "HEIC") return badRequest("HEIC 不支持，请上传 PNG/JPG/WebP");

  const webp = await sharp(buf, { failOn: "none" })
    .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
  await putBuffer(`${LOGO_KEY}.webp`, webp, "image/webp");

  const url = `${publicUrl(`${LOGO_KEY}.webp`)}?v=${Date.now()}`; // 版本参数防缓存
  await setSettings({ siteLogo: url });
  return json({ ok: true, logo: url });
}

export async function DELETE() {
  const denied = await guardAdmin();
  if (denied) return denied;
  await setSettings({ siteLogo: "" });
  return json({ ok: true });
}
