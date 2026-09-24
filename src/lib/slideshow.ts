/**
 * 幻灯片模式纯函数层（功能 4）：播放列表构建 + 循环索引步进。
 * 组件侧（SlideshowButton）只管取数、计时与渲染；这里的全部逻辑可 vitest 直测。
 * 不可变约定：所有函数返回新数组/新对象，不触碰入参。
 */

/** 播放列表元素：只保留放映必需的三字段（剥离 PhotoCardDTO 的 exif 等重负载） */
export interface SlideshowPhoto {
  sha1: string;
  title: string;
  displayUrl: string;
}

/** 自动切换间隔（毫秒）：经典画廊节奏 */
export const SLIDE_INTERVAL_MS = 4000;

/** 从列表页 DTO 挑出放映字段（/api/photos 返回的 PhotoCardDTO → 轻量播放元素） */
export function toSlideshowPhoto(p: { sha1: string; title: string; displayUrl: string }): SlideshowPhoto {
  return { sha1: p.sha1, title: p.title, displayUrl: p.displayUrl };
}

/**
 * 构建播放列表：当前照片在 items 中 → 从它截到页尾（列表序即放映序，
 * 循环由 nextIndex 回卷负责）；不在（深翻页/直链进入，首页 API 查不到它）
 * → 前置当前照片 + 整页兜底，保证"从这张开始播"的语义。
 */
export function buildPlaylist(current: SlideshowPhoto, items: readonly SlideshowPhoto[]): SlideshowPhoto[] {
  const idx = items.findIndex((p) => p.sha1 === current.sha1);
  if (idx >= 0) return items.slice(idx);
  return [current, ...items];
}

/** 归一化到 [0, length)：length<=0 钳到 0，越界/负索引取模回卷 */
function normalize(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** 下一张（末尾回卷到 0）；空列表防御性返回 0 */
export function nextIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (normalize(index, length) + 1) % length;
}

/** 上一张（头部回卷到末尾）；空列表防御性返回 0 */
export function prevIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (normalize(index, length) - 1 + length) % length;
}
