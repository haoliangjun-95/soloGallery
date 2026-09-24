import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
import { parseNotifyProvider } from "@/lib/notify";
import { getSettings, setSettings, type SettingKey } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  return json({ settings: await getSettings() });
}

export async function PUT(request: NextRequest) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("非法请求体");

  const patch: Partial<Record<SettingKey, string>> = {};
  const strings: SettingKey[] = [
    "siteTitle",
    "siteLogo",
    "pageSize",
    "syncIntervalMinutes",
    "notifyProvider",
    "notifyWebhookUrl",
    "notifyChatId",
  ];
  const booleans: SettingKey[] = ["commentsModerated", "syncAutoPublish", "originalView", "exposeGps"];
  for (const key of strings) {
    if (typeof body[key] === "string") patch[key] = (body[key] as string).slice(0, 512);
  }
  for (const key of booleans) {
    if (typeof body[key] === "boolean") patch[key] = body[key] ? "true" : "false";
  }
  if (patch.pageSize) {
    const n = Number(patch.pageSize);
    if (!Number.isInteger(n) || n < 1 || n > 96) return badRequest("pageSize 须为 1-96");
  }
  if (patch.syncIntervalMinutes) {
    const n = Number(patch.syncIntervalMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return badRequest("syncIntervalMinutes 须为 1-1440");
  }
  // 功能 14：provider 域校验复用 notify.ts 单一解析器；"" = 关闭合法
  if (patch.notifyProvider !== undefined && patch.notifyProvider !== "" && parseNotifyProvider(patch.notifyProvider) === null) {
    return badRequest("notifyProvider 须为 serverchan 或 telegram");
  }
  // webhook URL 仅在非空时校验且限 http(s)：防误填 file:/javascript: 等协议
  // 被 sendNotify 原样 fetch（SSRF 面收窄——目标仍由管理员自填，见清单技术债）
  if (patch.notifyWebhookUrl) {
    let url: URL;
    try {
      url = new URL(patch.notifyWebhookUrl);
    } catch {
      return badRequest("notifyWebhookUrl 须为合法 URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return badRequest("notifyWebhookUrl 仅支持 http/https");
    }
  }
  await setSettings(patch);
  return json({ ok: true, settings: await getSettings() });
}
