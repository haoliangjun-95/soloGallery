import { after, NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, json } from "@/lib/api";
import { COMMENT_CONTENT_MAX } from "@/lib/comment-view";
import { siteUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { buildCommentNotifyMessage, sendNotify } from "@/lib/notify";
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
  content: z.string().trim().min(1).max(COMMENT_CONTENT_MAX),
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
    // sha1/title 供通知拼详情链接与标题（功能 14），同表字段零额外查询
    select: { id: true, sha1: true, title: true },
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

  // 功能 14：IM 通知旁路——复用已取的 settings（零额外 DB 读）；sendNotify
  // 内部永不抛出（失败只 warn），评论响应不受推送延迟/失败影响。SPAM 路径
  // 刻意不通知（上方已提前 return）。
  // 收编 M-2：裸 void 改为 after() 官方生命周期（bundled docs after.md：
  // Route Handler 响应发送完毕后执行，错误/notFound/redirect 路径也执行，
  // serverless 平台可等待）——消除响应后冻结丢通知的技术债。
  // 收编 H-1：photoUrl 用 siteUrl() 单一出处（feed.xml/sitemap/OG 同款）——
  // request.url 的 origin 跟随 Host 头：直连部署是注入面（伪造 Host 让管理
  // 员通知里的链接指向仿冒站），反代部署是死链（origin 成内部上游地址）
  after(() =>
    sendNotify(
      {
        provider: settings.notifyProvider,
        webhookUrl: settings.notifyWebhookUrl,
        chatId: settings.notifyChatId,
      },
      buildCommentNotifyMessage({
        nickname: parsed.data.nickname,
        content: parsed.data.content,
        photoTitle: photo.title || photo.sha1.slice(0, 12),
        moderated,
        photoUrl: `${siteUrl()}/photo/${photo.sha1}`,
      }),
    ),
  );

  const message = moderated ? "评论已提交，审核通过后会显示" : "评论成功";
  return json({ ok: true, moderated, message });
}
