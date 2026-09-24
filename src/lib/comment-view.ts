/**
 * 评论展示纯函数层（功能 13）：渐进分页 + 内容上限单一出处。
 *
 * COMMENT_CONTENT_MAX 与评论 API 的 zod .max、textarea maxLength 共用同一
 * 常量（同功能 12 MAX_FILE_BYTES 模式）。收编 M-1 更正：两处计数口径并
 * 不相同——textarea maxLength 与本文件计数为 UTF-16 码元，zod v4 的 .max
 * 按码点（源码 v4/core/checks.cjs 原文 "Strings are measured in Unicode
 * code points, not UTF-16 units"）。码点 ≤ 码元恒成立，故服务端对浏览器
 * 输入（受 maxLength 约束 ≤2000 码元）永不误拒；非浏览器客户端最多可提
 * 交 2000 码点（≈4000 码元），属已知边界而非漂移（原「同口径零漂移」
 * 记载失实，评审以行为探针证伪：max(2) 放行 '𝕏a' 3 码元、拒 'abc'）。
 *
 * 分页刻意做在客户端（服务端 RSC 一次性给出全部 APPROVED 评论）：单人
 * 博客量级下评论总数有限，客户端切片零额外请求、零公开 GET API 面；
 * 评论量真到需要服务端游标分页时再下沉 queries.ts（记技术债）。
 */

/** 首屏评论条数；「查看更多」每次步进同一数量 */
export const COMMENT_PAGE_SIZE = 5;

/** 评论内容上限——textarea maxLength 与本文件计数为码元口径，zod .max 为
 *  码点口径（服务端恒不严于客户端，见头注 M-1） */
export const COMMENT_CONTENT_MAX = 2000;

/** 达到上限的 90% 起计数预警（琥珀色），避免 maxLength 静默截断 */
const COMMENT_WARN_RATIO = 0.9;

/**
 * 渐进分页切片：expandedAll（刚发布成功，新评论在 asc 末尾可能落在
 * 隐藏区）或 visible 已覆盖全量时原引用返回（收编 L-3 更正措辞：零拷贝
 * 省去每渲染一次的数组分配——textarea 每击键重渲染整组件，收益真实；
 * 组件内无消费引用同一性的机制，「React bail-out」系 optimistic.ts
 * insertIfAbsent 场景的术语移植失真）；否则取前 visible 条。不修改入参。
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

/**
 * 是否已超上限（收编 L-4）：浏览器未遵守 maxLength（历史上 IME 合成期
 * 存在此类缺陷）或值被程序化写入时的客户端兜底——计数转红 + 禁提交，
 * 而非提交后吃服务端 badRequest 无指引。恰好等于上限不算超。
 */
export function isOverCommentLimit(count: number): boolean {
  return count > COMMENT_CONTENT_MAX;
}
