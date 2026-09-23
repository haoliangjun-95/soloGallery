import { NextRequest, NextResponse } from "next/server";
import { json } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { presignGet } from "@/lib/s3";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

type Params = { params: Promise<{ sha1: string }> };

/**
 * 原图访问：仅已发布图片，302 到 presigned URL。默认附件下载；?inline=1 内联展示（灯箱用）。
 * 授权：「查看原图」设置关闭时仅管理员可访问——UI 入口隐藏不等于 API 受保护，
 * 否则任何人拼 URL 就能下载原图（含完整 EXIF/GPS），与设置意图相悖。
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { sha1 } = await params;
  const key = sha1.toLowerCase();
  if (!/^[a-f0-9]{6,40}$/.test(key)) return json({ error: "非法 key" }, 400);

  const [settings, admin] = await Promise.all([getSettings(), isAdmin()]);
  // 未开放且不管理：按 404 处理，不泄露照片是否存在
  if (settings.originalView !== "true" && !admin) return json({ error: "不存在" }, 404);

  const photo = await prisma.photo.findFirst({
    where: { OR: [{ sha1: key }, { sha1: { startsWith: key } }], published: true, missing: false },
    select: { sha1: true, fileName: true, storageKey: true },
  });
  if (!photo) return json({ error: "不存在" }, 404);

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const url = await presignGet(photo.storageKey, {
    expiresIn: 3600,
    downloadFileName: inline ? undefined : photo.fileName,
  });
  return NextResponse.redirect(url, 302);
}
