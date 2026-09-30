/**
 * 侧栏菜单视图逻辑（分类/年份/标签/器材共用）：快速筛选 + 折叠。
 * 纯函数层，vitest 直测；交互状态（输入/展开）在 SidebarMenus 客户端组件。
 */

/** 折叠态显示的条目数上限；超出才出现"展开全部" */
export const MENU_COLLAPSED_COUNT = 8;

/** 菜单快筛：大小写不敏感子串匹配（拉丁字母统一小写比较，中文原样包含）。空查询全过。 */
export function menuQueryMatch(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

/** 按查询过滤菜单条目；空查询返回原引用（零拷贝，与 sliceComments 同款姿态）。 */
export function filterMenuEntries<T extends { label: string }>(entries: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return entries;
  return entries.filter((e) => menuQueryMatch(e.label, q));
}

export interface CollapsedMenuView<T> {
  visible: T[];
  /** 折叠隐藏的条目数（"展开全部（N）"的 N；激活项补显不计入隐藏） */
  hiddenCount: number;
}

/**
 * 折叠视图：条目多于上限时显示前 collapsedCount 项，**激活项（当前筛选选中）
 * 永不因折叠而消失**——补显在尾部，用户改筛选后能立即看到自己在哪一项。
 * 不足上限原引用返回（无展开按钮）。
 */
export function collapsedMenuEntries<T extends { active?: boolean }>(
  entries: T[],
  collapsedCount: number = MENU_COLLAPSED_COUNT,
): CollapsedMenuView<T> {
  if (entries.length <= collapsedCount) return { visible: entries, hiddenCount: 0 };
  const visible = entries.slice(0, collapsedCount);
  for (let i = collapsedCount; i < entries.length; i++) {
    if (entries[i].active) visible.push(entries[i]);
  }
  return { visible, hiddenCount: entries.length - visible.length };
}
