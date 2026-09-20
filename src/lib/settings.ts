import { prisma } from "./db";

export const SETTING_DEFAULTS = {
  siteTitle: "soloGallery",
  pageSize: "24",
  commentsModerated: "false",
  syncIntervalMinutes: "15",
  syncAutoPublish: "false",
  originalView: "false",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingsMap = Record<SettingKey, string>;

export async function getSettings(): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany();
  const map = { ...SETTING_DEFAULTS } as SettingsMap;
  for (const row of rows) {
    if (row.key in map && row.value !== "") map[row.key as SettingKey] = row.value;
  }
  return map;
}

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
