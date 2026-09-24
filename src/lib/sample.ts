/**
 * 水塘抽样（reservoir sampling）：单遍等概率抽取 count 个元素，
 * 避免 SQL `ORDER BY RAND()` 全表排序。纯函数、不修改输入；
 * rand 可注入以便测试用确定性序列锁定替换行为。
 */
export function reservoirSample<T>(
  items: readonly T[],
  count: number,
  rand: () => number = Math.random,
): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return [...items];

  const picked: T[] = items.slice(0, count);
  for (let i = count; i < items.length; i++) {
    const j = Math.floor(rand() * (i + 1));
    if (j < count) picked[j] = items[i]!;
  }
  return picked;
}
