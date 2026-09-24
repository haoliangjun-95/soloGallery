/** 桶内布局约定 —— 与桌面壁纸软件共享同一个桶，画廊只写 display/。 */
export const BUCKET_LAYOUT = {
  originals: "objects", // objects/<sha1> 原图二进制（内容寻址，无扩展名）
  thumbs: "thumbs", //   thumbs/<id>_<hash8>.webp 缩略图（壁纸软件写）
  displays: "display", // display/<sha1>.webp 展示图 + <sha1>-<w>w.webp 网格变体（画廊写）
  manifests: "manifests", // manifests/<deviceUuid>-<ts>.json 设备清单快照
} as const;

export function originalKey(sha1: string) {
  return `${BUCKET_LAYOUT.originals}/${sha1}`;
}

export function displayKey(sha1: string) {
  return `${BUCKET_LAYOUT.displays}/${sha1}.webp`;
}

export const DISPLAY_WIDTH = 1920;
export const DISPLAY_QUALITY = 82;

/** 网格变体宽度档（功能 10）：400w 覆盖列表小格/正方形瓦片，800w 覆盖瀑布列/固定卡片 */
export const GRID_WIDTHS = [400, 800] as const;
export const GRID_QUALITY = 78;

/**
 * 网格变体键：display/<sha1>-<w>w.webp —— 刻意落在已公开读的 display/ 前缀下：
 * 桶策略（scripts/apply-bucket-policy.mjs）按前缀授予匿名读、仅 display/* 与
 * thumbs/*，新前缀需改策略脚本并在每个部署重跑 npm run policy，遗忘即碎图。
 * sha1 为十六进制不含 '-'，与 display/<sha1>.webp 及壁纸软件的 thumbs/ 键均无碰撞。
 */
export function gridKey(sha1: string, width: number): string {
  return `${BUCKET_LAYOUT.displays}/${sha1}-${width}w.webp`;
}

/**
 * 纯构造：sha1 → srcset 描述符串「<url>-400w.webp 400w, <url>-800w.webp 800w」。
 * toUrl 注入使本模块保持零 config/env 依赖（分层同 geo.ts：纯构造可 vitest 直测，
 * 副作用/环境读取留在调用方）；queries.ts 以 publicUrl 注入。
 * 键由 sha1 确定性派生（同 displayKey 模式），DB 的 gridReady 标志只表存在性。
 */
export function buildGridSrcset(sha1: string, toUrl: (key: string) => string): string {
  return GRID_WIDTHS.map((w) => `${toUrl(gridKey(sha1, w))} ${w}w`).join(", ");
}
