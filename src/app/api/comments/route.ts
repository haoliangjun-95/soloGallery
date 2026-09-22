import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { clientIp, rateAllow } from "@/lib/ratelimit";
import { checkSpam } from "@/lib/spam";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

const logger = createLogger("comment");

const schema = z.object({
  photoId: z.number().int().positive(),
  nickname: z.string().trim().min(1).max(24),
  email: z
    .string()
    .trim()
    .max(255)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "邮箱格式不正确")
    .optional()
    .or(z.literal("")),
  content: z.string().trim().min(1).max(2000),
  website: z.string().optional(), // 蜜罐：正常用户不会填
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("参数不合法", parsed.error.issues);

  // 蜜罐命中 → 伪装成功，静默丢弃
  if (parsed.data.website && parsed.data.website.trim()) {
    return json({ ok: true });
  }

  const ip = clientIp(request.headers);
  if (!rateAllow(ip, 1, 60 * 1000)) {
    return json({ error: "评论太频繁了，稍后再试" }, 429);
  }

  const photo = await prisma.photo.findFirst({
    where: { id: parsed.data.photoId, published: true, missing: false },
    select: { id: true },
  });
  if (!photo) return badRequest("图片不存在或未发布");

  // 反垃圾：命中规则静默标垃圾（对外仍返回成功，不给攻击者反馈）
  const verdict = checkSpam({ nickname: parsed.data.nickname, content: parsed.data.content, ip });
  if (verdict.spam) {
    await prisma.comment.create({
      data: {
        photoId: photo.id,
        nickname: parsed.data.nickname,
        email: parsed.data.email || null,
        content: parsed.data.content,
        status: "SPAM",
        ip,
      },
    });
    logger.warn(`已拦截(reason=${verdict.reason}) ip=${ip} nick=${parsed.data.nickname}`);
    return json({ ok: true, moderated: false, message: "评论成功" });
  }

  const settings = await getSettings();
  const moderated = settings.commentsModerated === "true";
  await prisma.comment.create({
    data: {
      photoId: photo.id,
      nickname: parsed.data.nickname,
      email: parsed.data.email || null,
      content: parsed.data.content,
      status: moderated ? "PENDING" : "APPROVED",
      ip,
    },
  });

  const message = moderated ? "评论已提交，审核通过后会显示" : "评论成功";
  return json({ ok: true, moderated, message });
}
