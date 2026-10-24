/**
 * MinIO 桶 → NAS 备份（Mac 侧执行，launchd 每日 03:40 调用）：
 * 1. 从服务器 MinIO 增量同步指定桶（默认 obsidian-bison / obsidian-note /
 *    travel-journal）到 NAS 挂载点 /Users/haoliang/huawei-nas/backups/minio/
 *    —— 按对象逐一比对（大小不一致或服务器端更新才下载），只增不删（桶里
 *    误删的对象在 NAS 上仍留有副本，这是备份不是镜像）。
 * 2. rsync 服务器 /www/minio/backup（每日两库 dump + manifests）到 NAS
 *    backups/db/，--delete 跟随服务器 7 天滚动保留。
 * NAS 未挂载时直接退出（nas-mount launchd 会自动重挂，下次再跑）。
 * sologallery / vividdeck 两桶不备（NAS 已有原件，可由 watcher 重建）。
 */
import "dotenv/config";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";
import { s3 } from "../src/lib/s3";

const BUCKETS = (process.env.BUCKET_BACKUP_LIST ?? "obsidian-bison,obsidian-note,travel-journal")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const NAS_ROOT = process.env.BUCKET_BACKUP_ROOT ?? "/Users/haoliang/huawei-nas/backups";
const SERVER = "root@110.42.234.144";
const CONCURRENCY = 4;

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });

async function isNasMounted(target: string): Promise<boolean> {
  // mount 输出形如 "... on /Users/haoliang/huawei-nas (smbfs, ..."——
  // 挂载点与 "(smbfs" 相邻，别写成 "huawei-nas smbfs"
  const mounts = execFileSync("/sbin/mount").toString();
  if (!mounts.includes(" on /Users/haoliang/huawei-nas (smbfs")) return false;
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** 单桶增量同步：返回 {objects, downloaded, skipped, bytes} */
async function syncBucket(bucket: string): Promise<{ objects: number; downloaded: number; skipped: number; bytes: number }> {
  const dir = path.join(NAS_ROOT, "minio", bucket);
  await mkdir(dir, { recursive: true });

  const objects: Array<{ key: string; size: number; lastModified?: Date }> = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key || o.Key.endsWith("/")) continue; // 目录占位符
      objects.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
    }
    token = res.NextContinuationToken;
  } while (token);

  let downloaded = 0;
  let skipped = 0;
  let bytes = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, objects.length) }, async () => {
    while (cursor < objects.length) {
      const o = objects[cursor++];
      const dest = path.join(dir, o.key);
      let needDownload = true;
      try {
        const st = await stat(dest);
        needDownload =
          st.size !== o.size ||
          (o.lastModified ? o.lastModified.getTime() > st.mtimeMs + 2000 : false);
      } catch {
        needDownload = true;
      }
      if (!needDownload) {
        skipped++;
        continue;
      }
      await mkdir(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.part`;
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: o.key }));
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(tmp);
        // Body 的联合类型收窄为 Node 流（运行时 SdkStreamMixin 本就带 pipe）
        Readable.from(res.Body as Readable).pipe(ws);
        ws.on("finish", () => resolve());
        ws.on("error", reject);
      });
      await rename(tmp, dest);
      downloaded++;
      bytes += o.size;
    }
  });
  await Promise.all(workers);
  return { objects: objects.length, downloaded, skipped, bytes };
}

if (!(await isNasMounted(NAS_ROOT))) {
  console.log(`${now()} NAS 未挂载，本次备份跳过（nas-mount 会自动重挂，明晚再跑）`);
  process.exit(0);
}

console.log(`${now()} 开始：桶 [${BUCKETS.join(", ")}] → ${NAS_ROOT}/minio`);
for (const bucket of BUCKETS) {
  try {
    const r = await syncBucket(bucket);
    console.log(
      `  ${bucket}: 对象 ${r.objects} · 新下载 ${r.downloaded} (${(r.bytes / 1024 / 1024).toFixed(1)}MB) · 未变跳过 ${r.skipped}`,
    );
  } catch (err) {
    console.error(`  ${bucket} 同步失败:`, err instanceof Error ? err.message : err);
  }
}

// 服务器每日小备份（两库 dump + manifests）镜像到 NAS，跟随服务器 7 天滚动
try {
  const dbDir = path.join(NAS_ROOT, "db");
  await mkdir(dbDir, { recursive: true });
  execFileSync(
    "/usr/bin/rsync",
    ["-az", "--delete", `${SERVER}:/www/minio/backup/`, `${dbDir}/`],
    { stdio: "pipe" },
  );
  console.log(`  db+manifests: rsync 完成`);
} catch (err) {
  console.error(`  db+manifests rsync 失败（不影响桶备份）:`, err instanceof Error ? err.message : err);
}
console.log(`${now()} 备份结束`);
