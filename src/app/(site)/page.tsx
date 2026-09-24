import Link from "next/link";
import { buildFilterUrl, type FilterPatch } from "@/lib/filter-url";
import {
  countFavorites,
  listCategories,
  listMemories,
  listMonths,
  listPhotos,
  listPhotosCalendar,
  listRandomPhotos,
  listTags,
  listYears,
} from "@/lib/queries";
import CalendarView from "@/components/CalendarView";
import MemoriesStrip from "@/components/MemoriesStrip";
import PhotoGrid from "@/components/PhotoGrid";
import RandomWalkLink from "@/components/RandomWalkLink";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/"> {
  searchParams: Promise<{
    category?: string;
    tag?: string;
    year?: string;
    q?: string;
    fav?: string;
    view?: string;
    month?: string;
    random?: string;
  }>;
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const year = Number.isInteger(Number(sp.year)) && Number(sp.year) > 1970 ? Number(sp.year) : undefined;
  const q = sp.q?.trim().slice(0, 64) || undefined;
  const fav = sp.fav === "1";
  // 无 view 参数时默认固定宽高视图；normal 不再是默认，需显式 ?view=normal
  const view = (["normal", "square", "fixed", "masonry", "list", "calendar"] as const).includes(sp.view as never)
    ? (sp.view as "normal" | "square" | "fixed" | "masonry" | "list" | "calendar")
    : "fixed";
  const month = /^(\d{4})-(\d{2})$/.test(sp.month ?? "") ? sp.month : undefined;
  // 随机漫游模式：?random=<nonce>（nonce 仅为绕开路由缓存触发重渲染，值本身无意义）
  const isRandom = Boolean(sp.random);
  // 默认首页（无筛选/随机参数且非日历视图）才展示"那年今日"；
  // 其余 view 值（square/masonry…）只影响布局，不排除 memories
  const isDefaultHome =
    !isRandom && !sp.category && !sp.tag && !year && !q && !fav && !month && view !== "calendar";

  const [categories, tags, years, favCount, calendarMonths, memories, randomItems] = await Promise.all([
    listCategories(),
    listTags(),
    listYears(),
    countFavorites(),
    // 日历视图与单月切换都需要月份列表，一次取齐
    view === "calendar" || month ? listMonths() : Promise.resolve([]),
    isDefaultHome ? listMemories() : Promise.resolve(null),
    // 随机漫游：水塘抽样一批照片；total=items.length 使 PhotoGrid 初始即 done，天然禁用无限滚动
    isRandom ? listRandomPhotos() : Promise.resolve(null),
  ]);

  /** 移动端 chips 组合筛选链接（PC 由侧栏承担）：未提及的维度叠加保留；
   *  透传当前视图（calendar 除外——点 chip 即退出日历），month 不透传（退出单月视图）。 */
  const qs = (patch: FilterPatch) =>
    buildFilterUrl(
      {
        category: sp.category,
        tag: sp.tag,
        year: sp.year,
        q: sp.q,
        fav: fav ? "1" : undefined,
        view: sp.view,
      },
      patch,
      { unset: "keep" },
    );

  // 日历视图：全量轻量数据按月分组平铺（随机模式优先，不取日历数据）
  const calendarData = view === "calendar" && !isRandom ? await listPhotosCalendar() : null;

  // 单月视图数据
  const monthIdx = month ? calendarMonths.findIndex((m) => m.ym === month) : -1;
  const listing =
    calendarData === null && !isRandom
      ? await listPhotos({ categorySlug: sp.category, tag: sp.tag, year, q, favorite: fav, month })
      : null;
  const total = randomItems ? randomItems.length : listing ? listing.total : 0;
  const pageSize = listing ? listing.pageSize : 60;
  const items = randomItems ?? (listing ? listing.items : []);
  const monthPrev = monthIdx > 0 ? calendarMonths[monthIdx - 1] : undefined; // 更近的月
  const monthNext =
    monthIdx >= 0 && monthIdx < calendarMonths.length - 1 ? calendarMonths[monthIdx + 1] : undefined; // 更早的月
  const monthTitle = month ? `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月` : "";

  return (
    <div className="w-full px-4 py-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6">
      <Sidebar
        categories={categories}
        tags={tags}
        years={years}
        totalAll={
          month || view === "calendar"
            ? calendarMonths.reduce((s, m) => s + m.count, 0)
            : isRandom
              ? // 随机模式的 total 是样本量（10），侧栏"全部照片"改用年份聚合的全量计数
                years.reduce((s, y) => s + y.count, 0)
              : total
        }
        totalFav={favCount}
        sp={{ category: sp.category, tag: sp.tag, year: sp.year, q: sp.q, fav: sp.fav, view: sp.view, month: sp.month, random: sp.random }}
      />

      <div className="min-w-0">
        {/* 移动端筛选栏（PC 走左侧栏） */}
        <div className="-mx-1 mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto p-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
          <FilterLink href={qs({ category: null, tag: null, year: null, q: null, fav: null })} active={!sp.category && !sp.tag && !sp.year && !fav && !month}>
            全部
          </FilterLink>
          {fav ? null : <FilterLink href={qs({ fav: "1" })} active={fav}>★ 收藏</FilterLink>}
          <FilterLink href="/?view=calendar" active={view === "calendar"}>
            日历
          </FilterLink>
          <RandomWalkLink
            active={isRandom}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2 ${
              isRandom ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-edge text-muted hover:text-foreground"
            }`}
          >
            随机漫游
          </RandomWalkLink>
          {categories.map((c) => (
            <FilterLink key={c.id} href={qs({ category: c.slug })} active={sp.category === c.slug}>
              {c.name}
              {c.count > 0 ? <span className="opacity-50 ml-1">{c.count}</span> : null}
            </FilterLink>
          ))}
          {years.map((y) => (
            <FilterLink key={y.year} href={qs({ year: String(y.year) })} active={sp.year === String(y.year)}>
              {y.year}
            </FilterLink>
          ))}
        </div>

        {isRandom ? (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              随机漫游 <span className="text-sm text-muted font-normal">{total} 张</span>
            </h1>
            <RandomWalkLink
              className="rounded-full border border-edge px-3 py-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
              title="重新随机一批照片"
            >
              换一批
            </RandomWalkLink>
          </div>
        ) : month ? (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/?view=calendar" className="text-sm text-muted hover:text-foreground" title="返回日历视图">
              ← 日历
            </Link>
            <h1 className="text-xl font-semibold">
              {monthTitle} <span className="text-sm text-muted font-normal">{total} 张</span>
            </h1>
            <div className="ml-auto flex items-center gap-2 text-sm">
              {monthPrev ? (
                <Link href={`/?month=${monthPrev.ym}`} className="rounded-full border border-edge px-3 py-1 text-muted hover:text-foreground" title={`${monthPrev.ym}（${monthPrev.count} 张）`}>
                  ‹ {Number(monthPrev.ym.slice(0, 4))}年{Number(monthPrev.ym.slice(5, 7))}月
                </Link>
              ) : null}
              {monthNext ? (
                <Link href={`/?month=${monthNext.ym}`} className="rounded-full border border-edge px-3 py-1 text-muted hover:text-foreground" title={`${monthNext.ym}（${monthNext.count} 张）`}>
                  {Number(monthNext.ym.slice(0, 4))}年{Number(monthNext.ym.slice(5, 7))}月 ›
                </Link>
              ) : null}
            </div>
          </div>
        ) : q ? (
          <h1 className="text-xl font-semibold mb-6">
            搜索「{q}」 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : fav ? (
          <h1 className="text-xl font-semibold mb-6">
            ★ 收藏 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : year ? (
          <h1 className="text-xl font-semibold mb-6">
            {year} 年 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : sp.category ? (
          <h1 className="text-xl font-semibold mb-6">
            {categories.find((c) => c.slug === sp.category)?.name ?? sp.category} <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : sp.tag ? (
          <h1 className="text-xl font-semibold mb-6">
            #{sp.tag} <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : view === "calendar" ? (
          <h1 className="text-xl font-semibold mb-6">日历</h1>
        ) : null}

        {isDefaultHome && memories ? <MemoriesStrip memories={memories} /> : null}

        {calendarData ? (
          <CalendarView months={calendarData} />
        ) : (
          <PhotoGrid
            key={`${sp.category ?? ""}|${sp.tag ?? ""}|${sp.year ?? ""}|${q ?? ""}|${fav ? "fav" : ""}|${view}|${month ?? ""}|${sp.random ?? ""}|${total}`}
            initialItems={items}
            total={total}
            pageSize={pageSize}
            view={view === "calendar" ? "normal" : view}
            query={{ category: sp.category, tag: sp.tag, year, q, fav, month }}
          />
        )}
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2 ${
        active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
