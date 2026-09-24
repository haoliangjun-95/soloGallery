/**
 * 乐观更新纯函数层（功能 9）：管理端「本地先行更新 + 失败回滚」的行级原语。
 *
 * 为什么不用快照整体回滚：两行并发乐观操作时，先失败者的快照回滚会把
 * 后发者的中间态一并 clobber 掉。行级函数式回滚（反向 patch / 原位插回）
 * 只碰目标行，天然与并发操作可交换。
 *
 * 全部函数不可变：返回新数组，未命中的行保持原引用（React 重渲染面最小）。
 * 组件侧（AdminPhotosClient/CommentsClient）只管状态接线；逻辑可 vitest 直测。
 */

/** 行级补丁：命中 id 的行浅合并 patch，未命中原样保留。id 不存在时返回等价新数组。 */
export function patchById<T extends { id: number }>(
  items: readonly T[],
  id: number,
  patch: Partial<T>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/** 移除命中 id 的行；id 不存在时返回等价新数组。 */
export function removeById<T extends { id: number }>(items: readonly T[], id: number): T[] {
  return items.filter((item) => item.id !== id);
}

/** 在 index 处插入一项（删除回滚 = 按删除前记录的 index 原位插回）。index 语义同 splice。 */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const next = items.slice();
  next.splice(index, 0, item);
  return next;
}

/**
 * 幂等插回（删除失败的回滚）：目标行已在列表中则原样返回原引用。
 * DELETE 失败意味着服务端该行始终存在——并发操作成功的 refresh 可能已把
 * 它随新 props 带回（镜像重置后行已复活），此时盲目 insertAt 会产生重复行
 * （React key 冲突）。返回原引用让 setState 触发 React bail-out，不白渲染。
 */
export function insertIfAbsent<T extends { id: number }>(items: T[], index: number, item: T): T[] {
  return items.some((it) => it.id === item.id) ? items : insertAt(items, index, item);
}
