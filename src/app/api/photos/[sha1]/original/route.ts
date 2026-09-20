import { NextRequest, NextResponse } from "next/server";
import { json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { presignGet } from "@/lib/s3";

export const runtime = "nodejs";

type Params = { params: Promise<{ sha1: string }> };

/** 原图访问：仅已发布图片，302 到 presigned URL。默认附件下载；?inline=1 内联展示（灯箱用）。 */
export async function GET(request: NextRequest, { params }: Params) {
  const { sha1 } = await params;
  const key = sha1.toLowerCase();
  if (!/^[a-f0-9]{6,40}$/.test(key)) return json({ error: "非法 key" }, 400);

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
