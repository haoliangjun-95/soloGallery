/**
 * 评论 IM 通知（功能 14）：Server酱 / Telegram Bot webhook 推送。
 *
 * 分层与 geo.ts 同款：纯函数（provider 解析/文案构造/请求体构造）vitest
 * 直测；副作用发送 sendNotify 失败只记日志、绝不抛出——推送是尽力而为的
 * 旁路，任何失败（网络/超时/配置残缺/非 2xx）都不得影响评论主流程。
 *
 * 配置来自 Setting 表三个字符串键（默认全空 = 关闭）：
 * notifyProvider / notifyWebhookUrl / notifyChatId（telegram 专用）。
 */

import { createLogger } from "./logger";

const logger = createLogger("notify");

/** 受支持的推送提供方（设置 API 白名单校验与 UI 选项共用） */
export const NOTIFY_PROVIDERS = ["serverchan", "telegram"] as const;
export type NotifyProvider = (typeof NOTIFY_PROVIDERS)[number];

/** 正文摘要截断上限（码点数）：通知只求可读的即时提醒，全文点链接看 */
export const NOTIFY_TEXT_MAX = 300;
/** 标题中照片标题的截断上限：Server酱 title 限 32 字符，前缀已占约 9 */
const TITLE_PHOTO_MAX = 20;
/** 发送超时：旁路推送不值得拖住进程太久（评论响应本身不等待它） */
export const NOTIFY_TIMEOUT_MS = 5000;

export interface NotifyConfig {
  /** 原始设置字符串（未经解析）——parseNotifyProvider 负责收窄 */
  provider: string;
  webhookUrl: string;
  /** telegram 专用；serverchan 忽略 */
  chatId: string;
}

export interface NotifyMessage {
  title: string;
  /** 用户可控文本（昵称：正文摘要）——serverchan 分支包进围栏代码块防
   *  markdown 注入（评审收编 M-1），telegram 纯文本原样携带 */
  text: string;
  /** 详情页链接（siteUrl() 服务端拼装，不含用户可控成分）——serverchan
   *  渲染在代码块之外单独成行（可安全点击），telegram 拼在正文末尾 */
  url?: string;
}

/** 设置字符串 → 受支持 provider；空串（默认关闭）/未知值/大小写不符 → null */
export function parseNotifyProvider(value: string): NotifyProvider | null {
  return (NOTIFY_PROVIDERS as readonly string[]).includes(value)
    ? (value as NotifyProvider)
    : null;
}

/**
 * 按码点截断（emoji 代理对算 1 个字符不被劈开）；不超长返回原引用
 * （与 hideGps 同款「无需变更即零拷贝」约定）。
 */
export function truncateNotifyText(text: string, max: number = NOTIFY_TEXT_MAX): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

/** 评论通知文案：标题带待审核标记，text = 昵称：内容摘要，链接单独走 url
 * （收编 M-1：用户可控文本与站点侧链接分离，serverchan 分支才能只对前者围栏） */
export function buildCommentNotifyMessage(input: {
  nickname: string;
  content: string;
  photoTitle: string;
  moderated: boolean;
  photoUrl?: string;
}): NotifyMessage {
  const title = `新评论${input.moderated ? "（待审核）" : ""}：${truncateNotifyText(input.photoTitle, TITLE_PHOTO_MAX)}`;
  return {
    title,
    text: `${input.nickname}：${truncateNotifyText(input.content)}`,
    url: input.photoUrl,
  };
}

/**
 * 构造 webhook 请求（纯函数，不发网络）：配置残缺（provider 未知/URL 空/
 * telegram 缺 chatId）一律返回 null = 视为关闭，调用方静默跳过。
 */
export function buildNotifyRequest(
  config: NotifyConfig,
  message: NotifyMessage,
): { url: string; init: RequestInit } | null {
  const provider = parseNotifyProvider(config.provider);
  const url = config.webhookUrl.trim();
  if (!provider || !url) return null;

  if (provider === "telegram") {
    const chatId = config.chatId.trim();
    if (!chatId) return null;
    return {
      url,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          // 无 parse_mode 即纯文本渲染，用户可控内容无注入面；关链接预览
          text: `${message.title}\n${message.text}${message.url ? `\n${message.url}` : ""}`,
          disable_web_page_preview: true,
        }),
      },
    };
  }

  // serverchan：title + desp（markdown 渲染）。收编 M-1：评论者可控文本包进
  // 围栏代码块——反引号全部剥离（围栏不可被提前闭合），markdown 链接/追踪
  // 像素在管理员的微信推送里只以源码呈现不可点击；站点侧 url（siteUrl()
  // 拼装，不含用户成分）留在块外单独成行保持可点
  const fenced = message.text.replace(/`/g, "");
  const desp = `\`\`\`\n${fenced}\n\`\`\`${message.url ? `\n\n${message.url}` : ""}`;
  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: message.title, desp }),
    },
  };
}

/**
 * 副作用发送：fire-and-forget 的终点。任何失败只 warn 不抛——调用方
 * （评论路由）经 after() 触发，评论入库响应不等待、不受影响。
 * 收编 L-1：buildNotifyRequest 也在 try 内——「永不抛出」是结构保证而非
 * 「当前实现恰好抛不了」的巧合（调用点不 await，rejection 无人接住）。
 */
export async function sendNotify(config: NotifyConfig, message: NotifyMessage): Promise<void> {
  try {
    const req = buildNotifyRequest(config, message);
    if (!req) return;
    const res = await fetch(req.url, {
      ...req.init,
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`IM 通知失败 HTTP ${res.status} provider=${config.provider}`);
    }
  } catch (err) {
    logger.warn("IM 通知异常", err instanceof Error ? err.message : String(err));
  }
}
