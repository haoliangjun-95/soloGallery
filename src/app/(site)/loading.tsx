/**
 * 路由级加载态：骨架屏对齐首页默认 fixed 视图（正方形卡片网格）与桌面端左侧栏。
 * animate-pulse 只动 opacity（合成器友好），globals.css 的 prefers-reduced-motion
 * 全局规则会自动将其降级为静态骨架。
 */

/** fixed 视图同款响应式网格列定义（与 PhotoGrid 保持一致）。 */
const GRID_COLS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(160px,40vw),1fr))] gap-1.5 items-start sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(290px,1fr))]";

const SKELETON_CARDS = 12;
const SKELETON_NAV_ITEMS = 3;

export default function Loading() {
  return (
    <div
      role="status"
      className="w-full px-4 py-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6"
    >
      <span className="sr-only">正在加载…</span>

      {/* 左侧栏骨架（仅桌面端可见，与 Sidebar 的 hidden lg:block 对齐） */}
      <div className="hidden lg:block" aria-hidden>
        <div className="sticky top-20 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="animate-pulse flex items-center gap-3 px-2 pb-4 pt-1">
            <div className="h-11 w-11 shrink-0 rounded-full bg-white/[0.07]" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-white/[0.07]" />
              <div className="h-2 w-14 rounded bg-white/[0.05]" />
            </div>
          </div>
          <div className="animate-pulse space-y-1.5 rounded-xl border border-white/[0.05] bg-white/[0.035] p-1.5">
            {Array.from({ length: SKELETON_NAV_ITEMS }, (_, i) => (
              <div key={i} className="h-9 rounded-lg bg-white/[0.05]" />
            ))}
          </div>
        </div>
      </div>

      {/* 主内容区骨架：正方形卡片 + 信息行，模拟 fixed 视图 */}
      <div className="min-w-0" aria-hidden>
        <div className={`animate-pulse ${GRID_COLS}`}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-lg bg-white/[0.05]" />
              <div className="h-2.5 w-3/4 rounded bg-white/[0.05]" />
              <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
