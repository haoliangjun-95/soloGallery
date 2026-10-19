/**
 * 本地目录 → 桶+库 通用导入器（由 PhotoPrism 迁移脚本泛化，NAS/外置盘/SMB
 * 挂载目录均可作源）：把 --src 目录里的图片（默认收 jpg/jpeg/heic/png，
 * --ext 可覆盖）导入 MinIO 桶并写入 soloGallery 数据库，画廊直接可见。
 * 源文件只读，不移动不删除。
 *
 *   npx tsx scripts/import-photoprism.mts --src /Volumes/华为家庭存储 --dry-run
 *   npx tsx scripts/import-photoprism.mts --src ...                  # 正式导入
 *   npx tsx scripts/import-photoprism.mts --src ... --concurrency 8
 *   npx tsx scripts/import-photoprism.mts --src ... --ext jpg,jpeg,png
 *   npx tsx scripts/import-photoprism.mts --src ... --min-age 300    # 防半写保护期(秒)
 *   npx tsx scripts/import-photoprism.mts --src ... --no-cache       # 忽略增量缓存重扫
 *
 * 约定与去重（幂等，可安全重跑）：
 * - 对象键 objects/<sha1>（无扩展名，与壁纸软件内容寻址一致），display/<sha1>.webp
 * - 库里已有同 sha1 行 → 跳过；桶里已有对象但缺行 → 不重传原图，只补行+display
 * - 增量缓存 (路径→size/mtimeMs/sha1) 存 .cache/import-cache.json：
 *   stat 未变的文件不读字节、不查库直接跳过；仅确认入库/已存在后才写缓存，
 *   dry-run 永不写缓存；魔数不识别的文件缓存 sha1:null，避免每轮重读
 * - mtime 距今不足 --min-age（默认 120s）的文件本轮跳过（手机备份可能写一半）
 * - 源目录不存在（挂载掉线）→ 静默返回 sourceMissing，供监听进程跳过本轮
 * - 跳过 SMB 挂载里的 AppleDouble(._*)/隐藏(.*)/#回收站(#*) 垃圾文件
 * - GPS 地名反查不在本脚本（1req/s 限速），导入完跑 backfill-gps.mts 补
 * - 视频与一切边车（.json/.yml/.xmp 等）不碰
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { extractExif } from "../src/lib/exif";
import { computeDhash, generateDisplay } from "../src/lib/image-pipeline";
import { putBuffer, exists } from "../src/lib/s3";
import { sniffImage } from "../src/lib/sniff";

const DEFAULT_EXT = [".jpg", ".jpeg", ".heic", ".png"];
const DEFAULT_MIN_AGE_SECONDS = 120;
const DEFAULT_CACHE_PATH = ".cache/import-cache.json";

export interface ImportOptions {
  /** 源目录（SMB 挂载点、任意本地路径） */
  src: string;
  concurrency?: number;
  dryRun?: boolean;
  /** 扩展名白名单，覆盖默认 jpg/jpeg/heic；不带点也行 */
  extWhitelist?: string[];
  /** mtime 保护期（秒），0 关闭；防手机备份写一半 */
  minAgeSeconds?: number;
  /** 增量缓存文件路径；null 禁用。默认 .cache/import-cache.json */
  cachePath?: string | null;
  log?: (line: string) => void;
}

export interface ImportResult {
  /** 源目录不存在（挂载掉线），本轮未做任何事 */
  sourceMissing: boolean;
  /** 进入处理流水线的文件数（不含缓存跳过/过新跳过） */
  scanned: number;
  skipCache: number;
  skipYoung: number;
  skipDb: number; // 库里已有（连桶带行都齐）
  skipBucket: number; // 桶里已有原图但缺行 → 补行+display，不重传
  uploaded: number;
  imported: number;
  skipUnknown: number; // 魔数嗅探不认识的（含负缓存命中）
  failed: number;
  bytes: number;
  failures: string[];
}

interface FileStatInfo {
  size: number;
  mtimeMs: number;
}

/** 增量缓存条目；sha1 为 null 表示"内容不识别"的负缓存 */
interface CacheEntry {
  size: number;
  mtimeMs: number;
  sha1: string | null;
}

type CacheMap = Record<string, CacheEntry>;

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return stem || fileName;
}

/** SMB 挂载里的垃圾：macOS AppleDouble 资源叉(._*)、隐藏文件(.*)、回收站(#*) */
function isJunkName(name: string): boolean {
  return name.startsWith(".") || name.startsWith("#");
}

async function walk(
  dir: string,
  exts: Set<string>,
  log: (m: string) => void,
  out: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    log(`  目录不可读，跳过: ${dir}（${err instanceof Error ? err.message : err}）`);
    return out;
  }
  for (const entry of entries) {
    if (isJunkName(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, exts, log, out);
    else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const log = opts.log ?? console.log;
  const dryRun = opts.dryRun ?? false;
  const concRaw = opts.concurrency ?? 4;
  const concurrency = Number.isInteger(concRaw) && concRaw >= 1 && concRaw <= 16 ? concRaw : 4;
  const exts = new Set(
    (opts.extWhitelist ?? DEFAULT_EXT).map((e) => {
      const lower = e.trim().toLowerCase();
      return lower.startsWith(".") ? lower : `.${lower}`;
    }),
  );
  const minAgeMs = Math.max(0, opts.minAgeSeconds ?? DEFAULT_MIN_AGE_SECONDS) * 1000;
  const cachePath = opts.cachePath === undefined ? DEFAULT_CACHE_PATH : opts.cachePath;
  const useCache = cachePath !== null;

  const result: ImportResult = {
    sourceMissing: false, scanned: 0, skipCache: 0, skipYoung: 0, skipDb: 0,
    skipBucket: 0, uploaded: 0, imported: 0, skipUnknown: 0, failed: 0,
    bytes: 0, failures: [],
  };

  try {
    const s = await stat(opts.src);
    if (!s.isDirectory()) throw new Error("不是目录");
  } catch {
    result.sourceMissing = true;
    return result;
  }

  let cache: CacheMap = {};
  if (useCache) {
    try {
      const parsed = JSON.parse(await readFile(cachePath as string, "utf8"));
      if (parsed && typeof parsed === "object") cache = parsed as CacheMap;
    } catch {
      // 首次运行或缓存损坏：从空缓存开始，代价只是全量重读一遍
    }
  }

  const files = await walk(opts.src, exts, log);

  // 一次性 stat 全部文件：总量统计 + 增量判定（命中缓存/过新的不进流水线）
  const stats = new Map<string, FileStatInfo>();
  let totalBytes = 0;
  await Promise.all(
    files.map(async (f) => {
      try {
        const s = await stat(f);
        stats.set(f, { size: s.size, mtimeMs: s.mtimeMs });
        totalBytes += s.size;
      } catch {
        // stat 失败的按不存在处理：不进流水线，缓存清理阶段会顺手删掉旧条目
      }
    }),
  );
  log(
    `源目录: ${opts.src} · 并发: ${concurrency} · ` +
      `${dryRun ? "DRY-RUN（只统计）" : "正式导入"} · 扫描到 ${files.length} 个白名单图片，共 ${(totalBytes / 1024 ** 3).toFixed(2)} GB`,
  );

  const now = Date.now();
  const pending: Array<{ file: string; st: FileStatInfo }> = [];
  for (const f of files) {
    const st = stats.get(f);
    if (!st) continue;
    // 缓存命中的文件必然已稳定（写一半的进不了缓存），先于过新判定
    const c = cache[f];
    if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) {
      if (c.sha1 === null) result.skipUnknown++;
      else result.skipCache++;
      continue;
    }
    if (minAgeMs > 0 && now - st.mtimeMs < minAgeMs) {
      result.skipYoung++;
      continue;
    }
    pending.push({ file: f, st });
  }

  /** 确认入库/已存在后才值得缓存：半写、嗅探失败的下轮还会重读 */
  const remember = (file: string, st: FileStatInfo, sha1: string | null): void => {
    if (!dryRun && useCache) cache[file] = { size: st.size, mtimeMs: st.mtimeMs, sha1 };
  };

  const importOne = async (file: string, st: FileStatInfo): Promise<void> => {
    result.scanned++;
    const rel = path.relative(opts.src, file);
    const buf = await readFile(file);
    const sniff = sniffImage(buf);
    if (sniff.format === "UNKNOWN") {
      result.skipUnknown++;
      log(`  跳过（魔数未知）: ${rel}`);
      remember(file, st, null);
      return;
    }
    const sha1 = createHash("sha1").update(buf).digest("hex");

    const existing = await prisma.photo.findUnique({ where: { sha1 }, select: { id: true } });
    if (existing) {
      result.skipDb++;
      remember(file, st, sha1);
      return;
    }

    const originalKey = `objects/${sha1}`;
    const bucketHas = await exists(originalKey);
    if (!bucketHas) {
      if (!dryRun) await putBuffer(originalKey, buf, sniff.mimeType);
      result.uploaded++;
      result.bytes += buf.length;
    } else {
      result.skipBucket++;
    }
    if (dryRun) return;

    // EXIF 与展示变体；display 失败不阻断入库（前台回退原图，重跑可补）
    const exif = await extractExif(buf);
    let width: number | undefined;
    let height: number | undefined;
    let dhash: string | null = null;
    try {
      const display = await generateDisplay(buf);
      width = display.width;
      height = display.height;
      await putBuffer(`display/${sha1}.webp`, display.webp, "image/webp");
      // 功能 15：感知哈希 best-effort（backfill-dhash.mts 可对历史行重跑补齐）
      try {
        dhash = await computeDhash(display.webp);
      } catch (err) {
        log(`  dHash 计算失败 ${rel}: ${err instanceof Error ? err.message : err}`);
      }
    } catch (err) {
      log(`  display 生成失败 ${rel}: ${err instanceof Error ? err.message : err}`);
    }

    await prisma.photo.create({
      data: {
        sha1,
        title: titleFromFileName(path.basename(file)),
        fileName: path.basename(file),
        storageKey: originalKey,
        mimeType: sniff.mimeType,
        format: sniff.format,
        fileSize: BigInt(buf.length),
        width,
        height,
        dhash,
        shotAt: exif?.shotAt ? new Date(exif.shotAt) : null,
        exif: exif ? (exif as unknown as object) : undefined,
        source: "UPLOAD",
        published: true,
      },
    });
    result.imported++;
    remember(file, st, sha1);
    if ((result.imported + result.skipBucket) % 25 === 0) {
      log(`  进度: 已导入 ${result.imported} · 跳过(库) ${result.skipDb} · 失败 ${result.failed}`);
    }
  };

  /** 简易并发池：固定 worker 数消费文件列表 */
  await new Promise<void>((resolve) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        try {
          await importOne(item.file, item.st);
        } catch (err) {
          result.failed++;
          result.failures.push(item.file);
          log(`  失败 ${item.file}: ${err instanceof Error ? err.message : err}`);
        }
      }
    });
    void Promise.all(workers).then(() => resolve());
  });

  if (useCache && !dryRun) {
    for (const key of Object.keys(cache)) {
      if (!stats.has(key)) delete cache[key];
    }
    try {
      const file = cachePath as string;
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(cache), "utf8");
      await rename(tmp, file);
    } catch (err) {
      log(`  缓存写入失败（不影响导入结果）: ${err instanceof Error ? err.message : err}`);
    }
  }

  log(
    [
      `完成${dryRun ? "（dry-run）" : ""}:`,
      `待处理 ${pending.length}`,
      `缓存跳过 ${result.skipCache}`,
      `过新跳过 ${result.skipYoung}`,
      `库中已存在 ${result.skipDb}`,
      `桶中已有补行 ${dryRun ? "-" : result.skipBucket}`,
      `上传原图 ${result.uploaded} (${(result.bytes / 1024 ** 3).toFixed(2)} GB)`,
      `新入库 ${dryRun ? "-" : result.imported}`,
      `魔数未知跳过 ${result.skipUnknown}`,
      `失败 ${result.failed}`,
    ].join(" · "),
  );
  return result;
}

// ---- CLI 入口（被 watch-nas.mts import 时 argv[1] 不是本文件，不会走到这里）----
if (process.argv[1]?.endsWith("import-photoprism.mts")) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const srcIndex = args.indexOf("--src");
  const srcArg = args.find((a) => a.startsWith("--src="))?.slice(6)
    ?? (srcIndex !== -1 ? args[srcIndex + 1] : undefined);
  const concArg = Number(args.find((a) => a.startsWith("--concurrency="))?.slice(14) ?? 4);
  const extArg = args.find((a) => a.startsWith("--ext="))?.slice(6);
  const minAgeIndex = args.indexOf("--min-age");
  const minAgeArg = Number(
    args.find((a) => a.startsWith("--min-age="))?.slice(10)
      ?? (minAgeIndex !== -1 ? args[minAgeIndex + 1] : undefined)
      ?? DEFAULT_MIN_AGE_SECONDS,
  );
  const noCache = args.includes("--no-cache");

  const res = await runImport({
    src: srcArg ?? "/www/photoprism/photos",
    concurrency: concArg,
    dryRun,
    extWhitelist: extArg ? extArg.split(",").filter(Boolean) : undefined,
    minAgeSeconds: Number.isFinite(minAgeArg) ? minAgeArg : DEFAULT_MIN_AGE_SECONDS,
    cachePath: noCache ? null : undefined,
  });
  if (res.sourceMissing) {
    console.log("源目录不存在（挂载是否掉线？），本轮跳过");
  }
  if (res.failures.length) {
    console.log("失败清单（重跑可补）:");
    for (const f of res.failures) console.log(`  ${f}`);
  }
  process.exit(res.failed > 0 ? 1 : 0);
}
