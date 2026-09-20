import { BUCKET_LAYOUT, displayKey, originalKey } from "./bucket-layout";
import { prisma } from "./db";
import { extractExif } from "./exif";
import { generateDisplay } from "./image-pipeline";
import { mergeManifests, parseManifest, type ManifestSnapshot, type MergedItem } from "./manifest";
import { exists, getBuffer, listKeys, putBuffer } from "./s3";
import { sniffImage } from "./sniff";
import { getSettings } from "./settings";

/** ------------------------------------------------------------------
 * 同步引擎：壁纸软件写桶（objects/ + thumbs/ + manifests/），
 * 画廊消费 —— 解析 manifests 归并出存活集合，为每张图补 display 变体并入库。
 * 幂等可重跑；画廊绝不写 objects/ thumbs/ manifests/。
 * ------------------------------------------------------------------ */

const globalForSync = globalThis as unknown as { __sologSyncing?: boolean };

export interface SyncSummary {
  runId: number;
  alreadyRunning: boolean;
  devices: number;
  total: number;
  imported: number;
  updated: number;
  missing: number;
  skipped: number;
  errors: string[];
}

function parseManifestKey(key: string): { deviceId: string; ts: number } | null {
  const base = key.slice(BUCKET_LAYOUT.manifests.length + 1).replace(/\.json$/, "");
  const idx = base.lastIndexOf("-");
  if (idx <= 0) return null;
  const deviceId = base.slice(0, idx);
  const ts = Number(base.slice(idx + 1));
  if (!deviceId || !Number.isFinite(ts)) return null;
  return { deviceId, ts };
}

/** 列出 manifests/ 并取每设备最新快照解析（dry-run 复用）。 */
export async function loadLatestManifests(): Promise<{ snapshots: ManifestSnapshot[]; keys: number }> {
  const keys = await listKeys(`${BUCKET_LAYOUT.manifests}/`);
  const latest = new Map<string, { key: string; ts: number }>();
  for (const key of keys) {
    const parsed = parseManifestKey(key);
    if (!parsed) continue;
    const prev = latest.get(parsed.deviceId);
    if (!prev || parsed.ts > prev.ts) latest.set(parsed.deviceId, { key, ts: parsed.ts });
  }
  const snapshots: ManifestSnapshot[] = [];
  for (const [deviceId, { key, ts }] of latest) {
    try {
      const buf = await getBuffer(key);
      const json: unknown = JSON.parse(buf.toString("utf8"));
      const { images, categories, tombstones } = parseManifest(json);
      snapshots.push({ deviceId, ts, images, categories, tombstones });
    } catch (err) {
      console.warn(`[sync] manifest 解析失败 ${key}:`, err instanceof Error ? err.message : err);
    }
  }
  return { snapshots, keys: keys.length };
}

/** thumbs/<id>_<hash8>.webp → 按 id 与完整 key 建索引（不依赖 hash8 语义猜测）。 */
export async function buildThumbIndex(): Promise<{ byId: Map<string, string>; all: Set<string> }> {
  const keys = await listKeys(`${BUCKET_LAYOUT.thumbs}/`);
  const byId = new Map<string, string>();
  const all = new Set(keys);
  for (const key of keys) {
    const base = key.slice(BUCKET_LAYOUT.thumbs.length + 1);
    const idPart = base.split("_")[0];
    if (idPart && !byId.has(idPart)) byId.set(idPart, key);
  }
  return { byId, all };
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `cat-${Date.now().toString(36)}`;
}

async function findOrCreateCategory(name?: string): Promise<{ id: number; name: string; slug: string } | null> {
  if (!name) return null;
  const slug = slugify(name);
  return prisma.category
    .upsert({ where: { slug }, update: {}, create: { name, slug } })
    .catch(() => prisma.category.findUniqueOrThrow({ where: { slug } })); // 并发唯一键竞态兜底
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return stem || fileName;
}

function ensureExt(fileName: string | undefined, format: string, hash: string): string {
  const extByFormat: Record<string, string> = {
    JPEG: "jpg",
    PNG: "png",
    WEBP: "webp",
    HEIC: "heic",
    GIF: "gif",
    BMP: "bmp",
    AVIF: "avif",
  };
  if (fileName && /\.[A-Za-z0-9]{2,5}$/.test(fileName)) return fileName;
  const base = fileName || hash.slice(0, 12);
  const ext = extByFormat[format]?.toLowerCase() ?? "jpg";
  return `${base}.${ext}`;
}

interface ImportOutcome {
  ok: boolean;
  skipped?: string;
  error?: string;
}

/** 下载原图字节 → 嗅探格式 → EXIF → display WebP 上传 → 入库。 */
async function importPhoto(
  item: MergedItem,
  thumbs: { byId: Map<string, string>; all: Set<string> },
  prebuilt: { categoryIds: Map<string, number>; tagIds: Map<string, number> },
  autoPublish: boolean,
): Promise<ImportOutcome> {
  const hash = item.hash;
  const oKey = originalKey(hash);
  if (!(await exists(oKey))) return { ok: false, skipped: "object-missing" };

  const buf = await getBuffer(oKey);
  const sniff = sniffImage(buf);
  const format = sniff.format === "UNKNOWN" ? (item.format?.toUpperCase() || "UNKNOWN") : sniff.format;

  let webp: Buffer | null = null;
  let width: number | undefined = item.width ?? undefined;
  let height: number | undefined = item.height ?? undefined;
  const exif = await extractExif(buf);
  try {
    const result = await generateDisplay(buf);
    webp = result.webp;
    width = result.width;
    height = result.height;
  } catch (err) {
    // HEIC 解码等失败：入库但无 display（详情页回退原图）
    console.warn(`[sync] display 生成失败 ${hash}:`, err instanceof Error ? err.message : err);
  }

  const dKey = displayKey(hash);
  if (webp) await putBuffer(dKey, webp, "image/webp");

  let thumbKey: string | undefined;
  if (item.wallpaperId) thumbKey = thumbs.byId.get(item.wallpaperId);
  if (!thumbKey) {
    const candidate = `${BUCKET_LAYOUT.thumbs}/${item.wallpaperId ?? ""}_${hash.slice(0, 8)}.webp`;
    if (thumbs.all.has(candidate)) thumbKey = candidate;
  }

  const fileName = ensureExt(item.fileName, format, hash);
  const categoryId = item.categoryName ? prebuilt.categoryIds.get(item.categoryName) ?? null : null;
  const tagIds = item.tags.map((t) => prebuilt.tagIds.get(t)).filter((id): id is number => id !== undefined);

  await prisma.photo.create({
    data: {
      sha1: hash,
      source: "SYNC",
      title: titleFromFileName(fileName),
      fileName,
      storageKey: oKey,
      mimeType: sniff.mimeType,
      format,
      fileSize: BigInt(buf.length),
      width: width ?? null,
      height: height ?? null,
      thumbKey: thumbKey ?? null,
      categoryId,
      published: autoPublish,
      shotAt: exif?.shotAt ? new Date(exif.shotAt) : null,
      exif: exif ? (exif as unknown as object) : undefined,
      wallpaperSnapshot: {
        wallpaperId: item.wallpaperId,
        favorite: item.favorite,
        tags: item.tags,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        updatedAt: item.updatedAt,
      },
      ...(tagIds.length
        ? {
            photoTags: {
              create: tagIds.map((tagId) => ({ tagId })),
            },
          }
        : {}),
    },
  });
  return { ok: true };
}

export async function runSync(trigger: "manual" | "cron"): Promise<SyncSummary> {
  // DB 级互斥：跨进程（CLI / dev server 定时器 / 手动触发）只允许一个同步在跑。
  // 超过 3 小时的 RUNNING 视为僵尸（进程被杀未收尾），接管前先标失败。
  const running = await prisma.syncRun.findFirst({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (running) {
    const stale = Date.now() - running.startedAt.getTime() > 3 * 3600_000;
    if (!stale) {
      return {
        runId: running.id,
        alreadyRunning: true,
        devices: 0,
        total: 0,
        imported: 0,
        updated: 0,
        missing: 0,
        skipped: 0,
        errors: ["已有同步在进行中"],
      };
    }
    await prisma.syncRun.update({
      where: { id: running.id },
      data: { status: "ERROR", error: "运行超时，视为僵尸已接管", finishedAt: new Date() },
    });
  }

  const run = await prisma.syncRun.create({ data: { status: "RUNNING", trigger } });
  const fail = async (error: string) => {
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "ERROR", error, finishedAt: new Date() } });
    return {
      runId: run.id,
      alreadyRunning: false,
      devices: 0,
      total: 0,
      imported: 0,
      updated: 0,
      missing: 0,
      skipped: 0,
      errors: [error],
    } satisfies SyncSummary;
  };

  if (globalForSync.__sologSyncing) {
    await prisma.syncRun.delete({ where: { id: run.id } }).catch(() => undefined);
    return {
      runId: run.id,
      alreadyRunning: true,
      devices: 0,
      total: 0,
      imported: 0,
      updated: 0,
      missing: 0,
      skipped: 0,
      errors: ["已有同步在进行中"],
    };
  }
  globalForSync.__sologSyncing = true;

  let imported = 0;
  let updated = 0;
  let missing = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const [{ snapshots }, thumbs, settings] = await Promise.all([
      loadLatestManifests(),
      buildThumbIndex(),
      getSettings(),
    ]);
    const autoPublish = settings.syncAutoPublish === "true";
    const merged = mergeManifests(snapshots);
    const alive = [...merged.values()].filter((m) => !m.deleted);

    const dbPhotos = await prisma.photo.findMany({
      where: { source: "SYNC" },
      select: { id: true, sha1: true, published: true, missing: true, fileName: true },
    });
    const dbByHash = new Map(dbPhotos.map((p) => [p.sha1, p]));
    const aliveHashes = new Set(alive.map((a) => a.hash));

    // 1) 新图导入。分类与标签先串行预建好 id 映射，导入阶段只读 Map，杜绝并发唯一键竞态。
    //    并发可配（SYNC_CONCURRENCY）：跨公网窄管道场景下多连接可摊开总吞吐。
    const concurrency = Math.min(16, Math.max(1, Number(process.env.SYNC_CONCURRENCY) || 3));
    const toImport = alive.filter((a) => !dbByHash.has(a.hash));
    const prebuilt = { categoryIds: new Map<string, number>(), tagIds: new Map<string, number>() };
    if (toImport.length) {
      const categoryNames = new Set<string>();
      const tagNames = new Set<string>();
      for (const a of toImport) {
        if (a.categoryName) categoryNames.add(a.categoryName);
        for (const t of a.tags) tagNames.add(t);
      }
      for (const name of categoryNames) {
        const cat = await findOrCreateCategory(name);
        if (cat) prebuilt.categoryIds.set(name, cat.id);
      }
      for (const name of tagNames) {
        const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
        prebuilt.tagIds.set(name, tag.id);
      }
    }
    await mapPool(toImport, concurrency, async (item) => {
      try {
        const outcome = await importPhoto(item, thumbs, prebuilt, autoPublish);
        if (outcome.ok) imported++;
        else if (outcome.skipped) skipped++;
      } catch (err) {
        const msg = `${item.hash}: ${err instanceof Error ? err.message : String(err)}`;
        console.warn("[sync] 导入失败", msg);
        if (errors.length < 50) errors.push(msg);
      }
    });

    // 2) 已入库：补 display、回填文件名、复活 missing
    const existingAlive = alive.filter((a) => dbByHash.has(a.hash));
    await mapPool(existingAlive, 4, async (item) => {
      const photo = dbByHash.get(item.hash)!;
      let touched = false;
      const dKey = displayKey(item.hash);
      if (!(await exists(dKey))) {
        try {
          const buf = await getBuffer(originalKey(item.hash));
          const result = await generateDisplay(buf);
          await putBuffer(dKey, result.webp, "image/webp");
          touched = true;
        } catch (err) {
          const msg = `${item.hash}: ${err instanceof Error ? err.message : String(err)}`;
          if (errors.length < 50) errors.push(msg);
        }
      }
      if (photo.missing) touched = true;
      const fillName = !photo.fileName && item.fileName ? ensureExt(item.fileName, "jpg", item.hash) : undefined;
      if (touched || fillName) {
        await prisma.photo.update({
          where: { id: photo.id },
          data: {
            ...(photo.missing ? { missing: false } : {}),
            ...(fillName ? { fileName: fillName } : {}),
          },
        });
        updated++;
      }
    });

    // 3) tombstone / 消失：下架标记（已下架的不重复计数，保持幂等）
    for (const photo of dbPhotos) {
      if (aliveHashes.has(photo.sha1) || photo.missing) continue;
      await prisma.photo.update({
        where: { id: photo.id },
        data: { missing: true, published: false },
      });
      missing++;
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        newCount: imported,
        updatedCount: updated,
        missingCount: missing,
        skippedCount: skipped,
        processed: imported + updated + missing,
        total: alive.length,
        error: errors.length ? errors.join("\n") : null,
      },
    });

    return {
      runId: run.id,
      alreadyRunning: false,
      devices: snapshots.length,
      total: alive.length,
      imported,
      updated,
      missing,
      skipped,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync] 同步失败:", msg);
    return fail(msg);
  } finally {
    globalForSync.__sologSyncing = false;
  }
}

/** 每分钟由 instrumentation 调用：到达间隔或从未同步过则触发。 */
export async function syncTick(): Promise<void> {
  try {
    const settings = await getSettings();
    const intervalMin = Math.max(1, Number(settings.syncIntervalMinutes) || 15);
    // 看最新一条任意状态的记录：RUNNING 说明本进程/其他进程正在跑（runSync 内有僵尸接管），不重复触发
    const last = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
    if (!last || last.status === "RUNNING") return;
    const due = Date.now() - last.startedAt.getTime() >= intervalMin * 60_000;
    if (due) {
      const summary = await runSync("cron");
      if (summary.imported || summary.missing || summary.errors.length) {
        console.log(
          `[sync][cron] 新增 ${summary.imported} 更新 ${summary.updated} 下架 ${summary.missing} 跳过 ${summary.skipped}`,
        );
      }
    }
  } catch (err) {
    console.warn("[sync][cron] tick 失败:", err instanceof Error ? err.message : err);
  }
}
