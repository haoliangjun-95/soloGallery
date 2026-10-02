import Link from "next/link";
import { buildFilterUrl, type FilterPatch } from "@/lib/filter-url";
import type { GearLists } from "@/lib/gear";
import { getSettings } from "@/lib/settings";
import type { CategoryDTO, TagDTO } from "@/lib/types";
import RandomWalkLink from "@/components/RandomWalkLink";
import SidebarMenus, { type MenuGroup } from "@/components/SidebarMenus";

export interface SidebarFilters {
  category?: string;
  tag?: string;
  year?: string;
  q?: string;
  fav?: string;
  view?: string;
  month?: string;
  random?: string;
  /** 器材筛选（功能 3）：归一化后的原始字符串，用于选中态比对 */
  make?: string;
  model?: string;
  lens?: string;
}

interface Props {
  categories: CategoryDTO[];
  tags: TagDTO[];
  years: { year: number; count: number }[];
  /** 器材分组数据（相机 + 镜头，功能 3） */
  gear: GearLists;
  totalAll: number;
  totalFav: number;
  sp: SidebarFilters;
}

/** 线性图标统一规格：16px、1.5 描边、圆角端点。 */
const ICON = "h-4 w-4";
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconGrid() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconStar() {
  // 收藏固定黄色星星，不随选中态变色
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="rgba(245,180,60,0.15)" stroke="#f5b43c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.6l6.5-.9z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.7 5.5-2.2V4.5L15 7.2 9 4z" />
      <path d="M9 4v13.3M15 7.2v12.8" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </svg>
  );
}

function IconShuffle() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}

/**
 * 左侧栏：磨砂深色面板，顶部头像+画廊名，核心入口卡片，
 * 下方 分类/年份/标签/器材 分组。选中态 = 柔和高亮 + 浅金左侧指示条。
 */
export default async function Sidebar({ categories, tags, years, gear, totalAll, totalFav, sp }: Props) {
  const settings = await getSettings().catch(() => null);
  const siteName = settings?.siteTitle || "soloGallery";

  const favActive = sp.fav === "1";
  const calActive = sp.view === "calendar";
  const randomActive = Boolean(sp.random);
  const noneActive =
    !sp.category && !sp.tag && !sp.year && !favActive && !calActive && !sp.month && !randomActive &&
    !sp.make && !sp.model && !sp.lens;

  /** 覆盖一组互斥维度，保留搜索词。view/month 仅在显式指定时保留，其余入口会退出日历/单月视图。 */
  const href = (patch: FilterPatch) =>
    buildFilterUrl({}, { q: sp.q ?? null, ...patch }, { unset: "clear" });

  return (
    <nav aria-label="筛选菜单" className="hidden lg:block">
      <aside className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* 顶部用户信息 */}
        <div className="flex items-center gap-3 px-2 pb-4 pt-1">
          {settings?.siteLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.siteLogo} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10 shrink-0" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.07] text-base font-semibold text-white/70 ring-1 ring-white/10 shrink-0">
              {siteName.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-white">{siteName}</p>
            <p className="mt-1 text-xs leading-none text-white/40">{totalAll} 张照片</p>
          </div>
        </div>

        {/* 核心入口：浅色卡片区分 */}
        <div className="space-y-0.5 rounded-xl border border-white/[0.05] bg-white/[0.035] p-1.5">
          <Item href={href({})} active={noneActive} label="全部照片" count={totalAll} icon={<IconGrid />} />
          <Item href={href({ fav: "1" })} active={favActive} label="收藏" count={totalFav} icon={<IconStar />} />
          <Item href={href({ view: "calendar" })} active={calActive} label="日历" count={totalAll} icon={<IconCalendar />} />
          {/* 地图是独立路由而非过滤参数——Sidebar 仅在首页渲染，/map 页面上无侧栏，active 恒 false；GPS 张数不在侧栏数据源里，省略 count */}
          <Item href="/map" active={false} label="地图" icon={<IconMap />} />
          {/* 统计同为独立路由（/stats），与地图同款姿态 */}
          <Item href="/stats" active={false} label="统计" icon={<IconChart />} />
          {/* 随机漫游是客户端按钮（每次点击生成新 nonce），非 Link——外观对齐 Item */}
          <RandomWalkLink
            title="随机挑选 10 张照片"
            active={randomActive}
            className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2 ${
              randomActive ? "bg-white/[0.07] text-white" : "text-[#c9c9c9] hover:bg-white/[0.045] hover:text-white"
            }`}
          >
            {randomActive ? (
              <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-[#f5b43c]" aria-hidden />
            ) : null}
            <span className="flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110">
              <IconShuffle />
            </span>
            <span className={`truncate text-sm ${randomActive ? "font-medium" : "font-normal"}`}>随机漫游</span>
          </RandomWalkLink>
        </div>

        {/* 筛选菜单（分类/年份/标签/器材）：客户端组件——快筛输入框 + 分组折叠 */}
        <SidebarMenus groups={menuGroups(categories, tags, years, gear, href, sp)} />
      </aside>
    </nav>
  );
}

/** 四组筛选菜单的条目预计算：href/激活态在服务端定死（URL 语义单一出处），客户端只管视图。 */
function menuGroups(
  categories: CategoryDTO[],
  tags: TagDTO[],
  years: { year: number; count: number }[],
  gear: GearLists,
  href: (patch: FilterPatch) => string,
  sp: SidebarFilters,
): MenuGroup[] {
  const groups: MenuGroup[] = [];
  if (categories.length > 0) {
    groups.push({
      key: "category",
      title: "分类",
      entries: categories.map((c) => ({
        key: String(c.id),
        label: c.name,
        count: c.count,
        href: href({ category: c.slug }),
        active: sp.category === c.slug,
      })),
    });
  }
  if (years.length > 0) {
    groups.push({
      key: "year",
      title: "年份",
      entries: years.map((y) => ({
        key: String(y.year),
        label: `${y.year} 年`,
        count: y.count,
        href: href({ year: String(y.year) }),
        active: sp.year === String(y.year),
      })),
    });
  }
  if (tags.length > 0) {
    groups.push({
      key: "tag",
      title: "标签",
      entries: tags.map((t) => ({
        key: String(t.id),
        label: `#${t.name}`,
        count: t.count,
        href: href({ tag: t.name }),
        active: sp.tag === t.name,
      })),
    });
  }
  if (gear.cameras.length + gear.lenses.length > 0) {
    groups.push({
      key: "gear",
      title: "器材",
      entries: [
        ...gear.cameras.map((c) => ({
          key: `cam-${c.make ?? ""}|${c.model ?? ""}`,
          // 相机 = make+model 双参数定位（组合展示名不可靠反拆）；clear 语义自动清掉 lens 等其余维度
          href: href({ make: c.make, model: c.model }),
          active: sp.make === c.make && sp.model === c.model,
          label: c.label,
          count: c.count,
          icon: "camera" as const,
        })),
        ...gear.lenses.map((l) => ({
          key: `lens-${l.lens}`,
          href: href({ lens: l.lens }),
          active: sp.lens === l.lens,
          label: l.lens,
          count: l.count,
          icon: "aperture" as const,
        })),
      ],
    });
  }
  return groups;
}

function Item({
  href,
  active,
  label,
  count,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        active ? "bg-white/[0.07] text-white" : "text-[#c9c9c9] hover:bg-white/[0.045] hover:text-white"
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-[#f5b43c]" aria-hidden />
      ) : null}
      {icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110">
          {icon}
        </span>
      ) : null}
      <span className={`truncate text-sm ${active ? "font-medium" : "font-normal"}`}>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-white/[0.08] px-2 py-[3px] text-xs leading-none text-white/60 tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
