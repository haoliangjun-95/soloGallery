import { cache } from "react";
import { prisma } from "./db";

export const SETTING_DEFAULTS = {
  siteTitle: "soloGallery",
  siteLogo: "",
  pageSize: "24",
  commentsModerated: "false",
  syncIntervalMinutes: "15",
  syncAutoPublish: "false",
  originalView: "false",
  /** 公开页面/API 是否暴露 EXIF GPS。默认公开（现状）；置 "false" 后管理端仍可见 */
  exposeGps: "true",
  /** 评论 IM 通知（功能 14）："" 关闭 | "serverchan" | "telegram"（lib/notify.ts 解析） */
  notifyProvider: "",
  /** webhook 完整 URL：Server酱 sctapi.ftqq.com/<SendKey>.send；Telegram bot<token>/sendMessage */
  notifyWebhookUrl: "",
  /** Telegram 专用 chat_id；Server酱忽略此键 */
  notifyChatId: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingsMap = Record<SettingKey, string>;

/**
 * 原始读取：每次调用都查库。供 instrumentation/syncTick/runSync 等
 * 非请求上下文使用——长驻进程若走请求缓存，改设置将永远不生效。
 */
export async function readSettings(): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany();
  const map = { ...SETTING_DEFAULTS } as SettingsMap;
  for (const row of rows) {
    if (row.key in map && row.value !== "") map[row.key as SettingKey] = row.value;
  }
  return map;
}

/**
 * 请求级缓存（React cache，Next 官方推荐模式）：同一请求内
 * layout/page/Sidebar/queries 多处调用共享一次查询。仅限 React 请求上下文。
 */
export const getSettings = cache(readSettings);

export async function setSettings(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => k in SETTING_DEFAULTS);
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
