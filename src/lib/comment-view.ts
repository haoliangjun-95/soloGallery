/**
 * 评论展示纯函数层（功能 13）：渐进分页 + 内容上限单一出处。
 *
 * COMMENT_CONTENT_MAX 与评论 API 的 zod .max、textarea maxLength 共用同一
 * 常量（同功能 12 MAX_FILE_BYTES 模式）：客户端预警计数与服务端拒绝判定
 * 永不漂移。
 *
 * 分页刻意做在客户端（服务端 RSC 一次性给出全部 APPROVED 评论）：单人
 * 博客量级下评论总数有限，客户端切片零额外请求、零公开 GET API 面；
 * 评论量真到需要服务端游标分页时再下沉 queries.ts（记技术债）。
 */

/** 首屏评论条数；「查看更多」每次步进同一数量 */
export const COMMENT_PAGE_SIZE = 5;

/** 评论内容上限（UTF-16 码元，与 textarea maxLength / zod .max 同口径） */
export const COMMENT_CONTENT_MAX = 2000;

/** 达到上限的 90% 起计数预警（琥珀色），避免 maxLength 静默截断 */
const COMMENT_WARN_RATIO = 0.9;

/**
 * 渐进分页切片：expandedAll（刚发布成功，新评论在 asc 末尾可能落在
 * 隐藏区）或 visible 已覆盖全量时原引用返回（零拷贝，React bail-out）；
 * 否则取前 visible 条。不修改入参。
 */
export function sliceComments<T>(
  comments: readonly T[],
  visible: number,
  expandedAll: boolean,
): readonly T[] {
  if (expandedAll || visible >= comments.length) return comments;
  return comments.slice(0, visible);
}

/** 「查看更多」步进：+PAGE_SIZE 封顶到总数（继续步进无意义） */
export function expandVisible(visible: number, total: number): number {
  return Math.min(visible + COMMENT_PAGE_SIZE, total);
}

/** 字数计数是否进入预警区（≥ 上限 90%） */
export function isNearCommentLimit(count: number): boolean {
  return count >= COMMENT_CONTENT_MAX * COMMENT_WARN_RATIO;
}
