"use client";

import Link from "next/link";
import { useState } from "react";
import { collapsedMenuEntries, filterMenuEntries, MENU_COLLAPSED_COUNT } from "@/lib/menu-view";

/** 器材条目的图标种别（服务端只传枚举，图标在客户端渲染） */
export type MenuIcon = "camera" | "aperture";

export interface MenuEntry {
  /** React key（分组内唯一） */
  key: string;
  label: string;
  count?: number;
  href: string;
  active: boolean;
  icon?: MenuIcon;
}

export interface MenuGroup {
  key: string;
  title: string;
  entries: MenuEntry[];
}

/**
 * 侧栏筛选菜单（分类/年份/标签/器材）：一个输入框跨组快筛 + 每组默认折叠
 * 到 MENU_COLLAPSED_COUNT 项（86 个标签不再铺满整栏）。条目的 href/激活态由
 * 服务端 Sidebar 预计算传入——URL 语义（互斥 clear、保留搜索词）留在纯函数
 * buildFilterUrl 的服务端消费方，本组件只管视图。
 */
export default function SidebarMenus({ groups }: { groups: MenuGroup[] }) {
  const [query, setQuery] = useState("");
  /** 展开到全量的分组（底部"展开全部"按钮；另一档是默认的前 8 项视图） */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 整组收起到分组头的分组（标题行开关；筛选中被强制展开） */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filtering = query.trim().length > 0;

  const filtered = groups.map((g) => ({ ...g, entries: filterMenuEntries(g.entries, query) }));
  const anyMatch = filtered.some((g) => g.entries.length > 0);

  /** 点中筛选项后该组回落折叠视图：选中项经 collapsedMenuEntries 的激活保护
   *  仍可见，全量列表不再残留（否则 86 个标签铺满侧栏直到手动收起）。 */
  const onEntryNavigate = (groupKey: string) => {
    setExpanded((prev) => {
      if (!prev.has(groupKey)) return prev; // 未展开全量的组零开销 bail-out
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
  };

  return (
    <div>
      <div className="relative mt-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) setQuery("");
          }}
          placeholder="筛选分类 / 年份 / 标签 / 器材"
          aria-label="筛选菜单项"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-[#f5b43c]/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="清除筛选"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            ×
          </button>
        ) : null}
      </div>

      {filtering && !anyMatch ? (
        <p className="mt-6 px-3 text-sm text-white/40">没有匹配「{query.trim()}」的筛选项</p>
      ) : null}

      {filtered.map((g) => {
        if (g.entries.length === 0) return null;
        // 筛选中强制展开：命中项可能在收起的组里
        const groupCollapsed = !filtering && collapsed.has(g.key);
        const collapsible = !filtering && g.entries.length > MENU_COLLAPSED_COUNT;
        const isOpen = expanded.has(g.key);
        // 筛选中不折叠（命中项可能就在折叠区）；展开态显示全量
        const { visible, hiddenCount } =
          !filtering && !isOpen ? collapsedMenuEntries(g.entries) : { visible: g.entries, hiddenCount: 0 };

        return (
          <div key={g.key} className="mt-8">
            <h3 className="mb-2.5">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                aria-expanded={!groupCollapsed}
                aria-controls={`sg-menu-${g.key}`}
                className="flex w-full items-center gap-1.5 rounded-md px-3 py-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 transition-colors hover:text-white/80 focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={`h-3 w-3 shrink-0 transition-transform duration-200 ${groupCollapsed ? "-rotate-90" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <span>{g.title}</span>
                <span className="ml-auto rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-normal leading-none text-white/45 tabular-nums tracking-normal">
                  {g.entries.length}
                </span>
              </button>
            </h3>
            <div id={`sg-menu-${g.key}`} className="menu-collapse" data-collapsed={groupCollapsed}>
              <div>
                <div className="space-y-0.5 pb-1">
                  {visible.map((e) => (
                    <SidebarItem key={e.key} entry={e} onNavigate={() => onEntryNavigate(g.key)} />
                  ))}
                  {collapsible ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-white/40 transition-colors hover:bg-white/[0.045] hover:text-white/70"
                    >
                      {isOpen ? "收起" : `展开全部（${hiddenCount}）`}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 与核心入口一致的菜单行：柔和高亮 + 浅金左侧指示条为选中态。
 *  onNavigate：点中后的回调（父级用于回落该组的展开全量状态）。 */
export function SidebarItem({ entry, onNavigate }: { entry: MenuEntry; onNavigate?: () => void }) {
  const active = entry.active;
  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        active ? "bg-white/[0.07] text-white" : "text-[#c9c9c9] hover:bg-white/[0.045] hover:text-white"
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-[#f5b43c]" aria-hidden />
      ) : null}
      {entry.icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110">
          {entry.icon === "camera" ? <IconCamera /> : <IconAperture />}
        </span>
      ) : null}
      <span className={`truncate text-sm ${active ? "font-medium" : "font-normal"}`}>{entry.label}</span>
      {typeof entry.count === "number" && entry.count > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-white/[0.08] px-2 py-[3px] text-xs leading-none text-white/60 tabular-nums">
          {entry.count}
        </span>
      ) : null}
    </Link>
  );
}

/** 线性图标统一规格：16px、1.5 描边、圆角端点（与 Sidebar 核心入口同款）。 */
const ICON = "h-4 w-4";
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function IconCamera() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function IconAperture() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v7.5M20.8 16.5l-6.5-3.7M3.2 16.5l6.5-3.7" />
    </svg>
  );
}
