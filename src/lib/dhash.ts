/**
 * 感知哈希（功能 15）：sha1 只能精确去重，连拍/压缩重存/轻微裁切的近似图
 * 需要 dHash（difference hash）按汉明距离找。哈希计算在 image-pipeline
 * （sharp 依赖），本模块是纯函数层：距离/分组/保留建议，vitest 直测。
 */

/** dHash 位数（9×8 像素 → 64 bit）与十六进制长度（64/4），写入与读取两端契约 */
export const DHASH_BITS = 64;
export const DHASH_HEX_LENGTH = 16;

/**
 * 相似判定的汉明距离档位（相似页 ?t= 白名单）。833 张实测校准：同图重存/压缩
 * 变体 ≤4；紧凑连拍 ≤6；宽松到 10 连壁纸类抽象图（dHash 空间稠密）都会链成
 * 巨型簇——传递闭合把结构相近的壁纸越滚越大，组大到失去清理价值。
 */
export const DHASH_THRESHOLD_PRESETS = [4, 6, 10] as const;
export type DhashThreshold = (typeof DHASH_THRESHOLD_PRESETS)[number];
export const DHASH_DEFAULT_THRESHOLD: DhashThreshold = 6;

/** 相似页阈值参数解析：白名单外的值（含缺省/畸形）一律回落标准档 */
export function parseDhashThreshold(raw: string | string[] | undefined | null): DhashThreshold {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return (DHASH_THRESHOLD_PRESETS as readonly number[]).includes(n) ? (n as DhashThreshold) : DHASH_DEFAULT_THRESHOLD;
}

const DHASH_HEX_RE = new RegExp(`^[0-9a-f]{${DHASH_HEX_LENGTH}}$`);

/** 入库哈希与 DB 读回的一致性校验：小写十六进制定长 */
export function isValidDhash(hex: string): boolean {
  return DHASH_HEX_RE.test(hex);
}

/** 两个 64 位哈希的汉明距离（不同位数按 BigInt XOR 弹性计数） */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  while (x) {
    x &= x - BigInt(1); // 清最低有效位（Kernighan 技巧）
    distance++;
  }
  return distance;
}

/** 推荐保留者的比较字段：suggestKeeper 的排序依据 */
export interface KeeperCandidate {
  id: number;
  favorite: boolean;
  width: number | null;
  height: number | null;
  /** DTO 层已从 bigint 转换的原始文件字节数 */
  fileSize: number;
}

/**
 * 组内推荐保留者：收藏优先 → 像素面积 → 文件字节 → id 小者兜底（确定性）。
 * 像素先于字节：近似组里压缩重存版字节小、裁切版像素小，像素面积更能挑出母版。
 */
export function suggestKeeper<T extends KeeperCandidate>(members: T[]): T {
  let best = members[0];
  for (const m of members.slice(1)) {
    const rank =
      Number(m.favorite) - Number(best.favorite) ||
      (m.width ?? 0) * (m.height ?? 0) - (best.width ?? 0) * (best.height ?? 0) ||
      m.fileSize - best.fileSize ||
      best.id - m.id;
    if (rank > 0) best = m;
  }
  return best;
}

/** groupSimilar 的输入条目：哈希 + 保留建议所需字段 */
export interface SimilarEntry extends KeeperCandidate {
  dhash: string;
}

export interface SimilarGroup<T> {
  members: T[];
  keeperId: number;
}

/**
 * 全量两两比对 + 并查集聚簇（O(n²)，833 张 ≈ 35 万次 popcount，毫秒级）。
 * 传递闭合：A~B、B~C 而 A!~C 时同簇——连拍序列的现实形态，拆开反而漏判。
 * 返回仅 ≥2 张的簇：簇内保留者排首位、其余按 id 升序（渲染稳定）；
 * 簇间按成员数降序、并列按 keeperId 升序。畸形哈希条目静默跳过（写路径
 * 已校验，这里防御存量脏数据拖垮整页）。
 */
export function groupSimilar<T extends SimilarEntry>(
  entries: T[],
  threshold: number = DHASH_DEFAULT_THRESHOLD,
): SimilarGroup<T>[] {
  const valid = entries.filter((e) => isValidDhash(e.dhash));
  const parent = valid.map((_, i) => i);

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]; // 路径减半
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (hammingDistance(valid[i].dhash, valid[j].dhash) <= threshold) union(i, j);
    }
  }

  const byRoot = new Map<number, T[]>();
  for (let i = 0; i < valid.length; i++) {
    const root = find(i);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(valid[i]);
    else byRoot.set(root, [valid[i]]);
  }

  return [...byRoot.values()]
    .filter((members) => members.length >= 2)
    .map((members) => {
      const keeper = suggestKeeper(members);
      const rest = members.filter((m) => m.id !== keeper.id).sort((a, b) => a.id - b.id);
      return { members: [keeper, ...rest], keeperId: keeper.id };
    })
    .sort((a, b) => b.members.length - a.members.length || a.keeperId - b.keeperId);
}
