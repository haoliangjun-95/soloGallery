import { NextResponse } from "next/server";
import { guardAdmin, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";

/** 手动触发同步：后台执行，前端轮询 GET 获取进度。 */
export async function POST() {
  const denied = await guardAdmin();
  if (denied) return denied;
  void runSync("manual").catch((err) => console.error("[sync][manual]", err));
  return json({ started: true });
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const missing = await prisma.photo.findMany({
    where: { missing: true },
    select: { id: true, title: true, sha1: true, fileName: true },
    take: 100,
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      ...r,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      startedAt: r.startedAt.toISOString(),
    })),
    missing,
  });
}
