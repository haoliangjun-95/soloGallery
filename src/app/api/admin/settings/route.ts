import { NextRequest } from "next/server";
import { badRequest, guardAdmin, json } from "@/lib/api";
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
  const strings: SettingKey[] = ["siteTitle", "pageSize", "syncIntervalMinutes"];
  const booleans: SettingKey[] = ["commentsModerated", "syncAutoPublish", "originalView"];
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
  await setSettings(patch);
  return json({ ok: true, settings: await getSettings() });
}
