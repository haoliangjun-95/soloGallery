/**
 * 解析壁纸软件的 manifests/<deviceUuid>-<ts>.json 快照并按其 CRDT 规则归并。
 *
 * 真实 schema（2026-09 对 vividdeck 桶体检确认）：
 * {
 *   version: 1,
 *   updatedAt: <ms>, updatedBy: "<deviceUuid>",
 *   images: [{ id, fileName, hash(sha1), width, height, sizeBytes,
 *              format: "jpg", categoryId: string|null, tags: string[],
 *              favorite: bool, addedAt: <ms>, updatedAt: <ms>, updatedBy }],
 *   categories: [{ id, name, createdAt: <ms>, updatedAt: <ms> }],
 *   tombstones: [{ id, kind: "image" | "category", deletedAt: <ms>, deletedBy }]
 * }
 *
 * 解析策略：优先按上述 schema；找不到 images/categories 键时回退到
 * 防御性 duck-typing（递归收集带 40 位 hex hash 的对象），容忍 schema 演进。
 */

export interface RawImage {
  id?: string;
  hash: string;
  fileName?: string;
  localFile?: string | null;
  width?: number;
  height?: number;
  sizeBytes?: number;
  format?: string | null;
  categoryId?: string | null;
  favorite?: boolean;
  tags?: unknown;
  updatedAt?: string | number;
  updatedBy?: string;
  /** 兼容旧假设的记录级删除标记（真实 schema 中删除走顶层 tombstones） */
  deleted?: boolean;
  tombstone?: boolean;
  deletedAt?: string | number;
}

export interface RawCategory {
  id: string;
  name: string;
  updatedAt?: number;
}

export interface RawTombstone {
  id: string;
  kind?: string;
  deletedAt?: number;
}

export interface MergedItem {
  hash: string;
  wallpaperId?: string;
  fileName?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  format?: string;
  favorite: boolean;
  tags: string[];
  categoryId?: string;
  categoryName?: string;
  updatedAt?: string;
  deleted: boolean;
}

export interface ManifestSnapshot {
  deviceId: string;
  ts: number;
  images: RawImage[];
  categories: RawCategory[];
  tombstones: RawTombstone[];
}

const SHA1_RE = /^[a-f0-9]{40}$/;

export function isValidSha1(hash: unknown): hash is string {
  return typeof hash === "string" && SHA1_RE.test(hash.trim().toLowerCase());
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) {
    if (typeof t === "string" && t.trim()) out.add(t.trim());
    else if (t && typeof t === "object") {
      const name = (t as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) out.add(name.trim());
    }
  }
  return [...out];
}

/** 解析单个 manifest JSON 为标准快照结构。 */
export function parseManifest(json: unknown): { images: RawImage[]; categories: RawCategory[]; tombstones: RawTombstone[] } {
  if (!json || typeof json !== "object") return { images: [], categories: [], tombstones: [] };
  const obj = json as Record<string, unknown>;

  // 主路径：真实 schema
  if (Array.isArray(obj.images)) {
    const images = (obj.images as unknown[]).filter(
      (v): v is RawImage => !!v && typeof v === "object" && isValidSha1((v as { hash?: unknown }).hash),
    );
    const categories = Array.isArray(obj.categories)
      ? (obj.categories as unknown[]).filter(
          (v): v is RawCategory =>
            !!v &&
            typeof v === "object" &&
            typeof (v as { id?: unknown }).id === "string" &&
            typeof (v as { name?: unknown }).name === "string",
        )
      : [];
    const tombstones = Array.isArray(obj.tombstones)
      ? (obj.tombstones as unknown[]).filter(
          (v): v is RawTombstone => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string",
        )
      : [];
    return { images, categories, tombstones };
  }

  // 回退：duck-typing 递归收集
  const images: RawImage[] = [];
  const tombstones: RawTombstone[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const el of node) walk(el);
      return;
    }
    const record = node as Record<string, unknown>;
    if (isValidSha1(record.hash)) images.push(node as unknown as RawImage);
    if (typeof record.id === "string" && (record.kind === "image" || record.kind === "category" || record.deletedAt)) {
      tombstones.push(node as unknown as RawTombstone);
    }
    for (const [k, v] of Object.entries(record)) {
      if (k === "hash" || k === "tags") continue;
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(json);
  return { images, categories: [], tombstones };
}

function itemTime(item: RawImage | RawCategory | RawTombstone): number {
  const t = (item as RawImage).updatedAt ?? (item as RawTombstone).deletedAt;
  if (typeof t === "number") return t > 1e12 ? t : t * 1000;
  if (typeof t === "string") {
    const d = new Date(t).getTime();
    if (!isNaN(d)) return d;
  }
  return 0;
}

/**
 * 归并规则（与壁纸软件一致）：
 * - tombstone 按 id：image 的 id 命中 image-tombstone 即该记录死亡；同 hash 的其他存活记录仍在
 * - 记录级 LWW：updatedAt 大者胜，同则 updatedBy/deviceId 字典序
 * - 存活记录间：favorite 取或、tags 并集；展示字段取胜者，缺失则回填
 * - 分类同样按 id LWW 取名，分类 tombstone 过滤
 */
export function mergeManifests(snapshots: ManifestSnapshot[]): Map<string, MergedItem> {
  const imageTombIds = new Set<string>();
  const categoryTombIds = new Set<string>();
  for (const snap of snapshots) {
    for (const t of snap.tombstones) {
      if (!t.kind || t.kind === "image") imageTombIds.add(t.id);
      else if (t.kind === "category") categoryTombIds.add(t.id);
    }
  }

  // 分类归并：id → name（LWW）
  const categoryNames = new Map<string, string>();
  const categoryTime = new Map<string, number>();
  for (const snap of snapshots) {
    for (const cat of snap.categories) {
      if (categoryTombIds.has(cat.id)) continue;
      const t = cat.updatedAt ?? 0;
      if (t >= (categoryTime.get(cat.id) ?? -1)) {
        categoryTime.set(cat.id, t);
        categoryNames.set(cat.id, cat.name);
      }
    }
  }

  // 存活 image 记录按 hash 分桶
  const byHash = new Map<string, RawImage[]>();
  for (const snap of snapshots) {
    for (const img of snap.images) {
      const hash = img.hash.trim().toLowerCase();
      if (!isValidSha1(hash)) continue;
      if (img.id && imageTombIds.has(img.id)) continue;
      if (img.deleted || img.tombstone) continue;
      const list = byHash.get(hash) ?? [];
      list.push(img);
      byHash.set(hash, list);
    }
  }

  const merged = new Map<string, MergedItem>();
  for (const [hash, list] of byHash) {
    const sorted = [...list].sort((a, b) => {
      const dt = itemTime(b) - itemTime(a);
      if (dt !== 0) return dt;
      const ua = a.updatedBy ?? "";
      const ub = b.updatedBy ?? "";
      return ua < ub ? -1 : ua > ub ? 1 : 0;
    });
    const winner = sorted[0];
    const fill = <T>(pick: (it: RawImage) => T | undefined): T | undefined =>
      sorted.map(pick).find((v) => v !== undefined && v !== null);

    const fileName =
      winner.fileName?.trim() ||
      fill((it) => it.fileName?.trim()) ||
      winner.localFile?.split(/[\\/]/).pop()?.trim() ||
      fill((it) => it.localFile?.split(/[\\/]/).pop()?.trim()) ||
      undefined;

    const tags = new Set<string>();
    let favorite = false;
    for (const it of sorted) {
      for (const t of normalizeTags(it.tags)) tags.add(t);
      favorite = favorite || Boolean(it.favorite);
    }

    const categoryId =
      winner.categoryId !== undefined && winner.categoryId !== null
        ? winner.categoryId
        : (fill((it) => (it.categoryId !== undefined && it.categoryId !== null ? it.categoryId : undefined)) ?? undefined);

    merged.set(hash, {
      hash,
      wallpaperId: winner.id ?? fill((it) => it.id),
      fileName: fileName && fileName.length ? fileName : undefined,
      width: winner.width ?? fill((it) => it.width),
      height: winner.height ?? fill((it) => it.height),
      sizeBytes: winner.sizeBytes ?? fill((it) => it.sizeBytes),
      format: winner.format ?? fill((it) => (it.format ? String(it.format) : undefined)),
      favorite,
      tags: [...tags],
      categoryId,
      categoryName: categoryId ? categoryNames.get(categoryId) : undefined,
      updatedAt: winner.updatedAt !== undefined ? String(winner.updatedAt) : undefined,
      deleted: false,
    });
  }
  return merged;
}
