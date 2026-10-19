/**
 * NAS 目录监听（常驻进程，nas-watcher 容器的 CMD，也可裸跑）：
 * 定时轮询源目录并增量导入 MinIO+MySQL，供画廊直接可见。
 *
 *   WATCH_INTERVAL_SECONDS=120 NAS_SRC=/nas-src npx tsx scripts/watch-nas.mts
 *
 * 为什么轮询而不是 fswatch/文件事件：macOS FSEvents 不上报 SMB 卷上由
 * 其他设备（手机/NAS 端）产生的远端变更，事件方案对主场景无效；轮询 +
 * stat 增量缓存（见 import-photoprism.mts）在使用上等同监听。
 * 单轮异常只打日志不退出；源目录（挂载）掉线静默跳过本轮，重挂自动恢复。
 * 只增不删：下架走画廊后台（删除单向契约）。
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runImport } from "./import-photoprism.mts";

const SRC = process.env.NAS_SRC ?? "/nas-src";
/** 间隔下限 30s：过密的轮询对 SMB 大目录是纯负担 */
const INTERVAL = Math.max(30, Number(process.env.WATCH_INTERVAL_SECONDS ?? 120) || 120);

let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  const startedAt = Date.now();
  try {
    const res = await runImport({ src: SRC });
    if (res.sourceMissing) {
      console.log(`[watch] 源目录不存在（挂载掉线？），本轮跳过`);
      return;
    }
    console.log(
      `[watch] 本轮完成 耗时${((Date.now() - startedAt) / 1000).toFixed(1)}s：` +
        `缓存跳过 ${res.skipCache} · 过新跳过 ${res.skipYoung} · 处理 ${res.scanned}` +
        `（新入库 ${res.imported} · 库中已有 ${res.skipDb} · 上传 ${res.uploaded}）` +
        ` · 魔数未知 ${res.skipUnknown} · 失败 ${res.failed}`,
    );
  } catch (err) {
    console.error(`[watch] 本轮异常（下轮自动重试）:`, err instanceof Error ? err.message : err);
  } finally {
    busy = false;
  }
}

async function shutdown(signal: string, timer: NodeJS.Timeout): Promise<void> {
  console.log(`[watch] 收到 ${signal}，退出`);
  clearInterval(timer);
  try {
    await prisma.$disconnect();
  } catch {
    // 退出路径上的断连失败无需处理
  }
  process.exit(0);
}

console.log(`[watch] NAS 监听启动：src=${SRC} · 间隔 ${INTERVAL}s`);
const timer = setInterval(() => void tick(), INTERVAL * 1000);
process.on("SIGTERM", () => void shutdown("SIGTERM", timer));
process.on("SIGINT", () => void shutdown("SIGINT", timer));
void tick();
