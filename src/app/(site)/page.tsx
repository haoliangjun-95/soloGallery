import Link from "next/link";
import {
  countFavorites,
  listCategories,
  listMonths,
  listPhotos,
  listPhotosCalendar,
  listTags,
  listYears,
} from "@/lib/queries";
import CalendarView from "@/components/CalendarView";
import PhotoGrid from "@/components/PhotoGrid";
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

  const [categories, tags, years, favCount, calendarMonths] = await Promise.all([
    listCategories(),
    listTags(),
    listYears(),
    countFavorites(),
    // 日历视图与单月切换都需要月份列表，一次取齐
    view === "calendar" || month ? listMonths() : Promise.resolve([]),
  ]);

  /** 移动端 chips 组合筛选链接（PC 由侧栏承担）。 */
  const qs = (patch: {
    category?: string | null;
    tag?: string | null;
    year?: number | null;
    q?: string | null;
    fav?: boolean | null;
  }) => {
    const params = new URLSearchParams();
    const merged = {
      category: "category" in patch ? patch.category : sp.category,
      tag: "tag" in patch ? patch.tag : sp.tag,
      year: "year" in patch ? (patch.year ? String(patch.year) : null) : sp.year,
      q: "q" in patch ? patch.q : sp.q,
      fav: "fav" in patch ? patch.fav : fav,
    };
    if (merged.category) params.set("category", merged.category);
    if (merged.tag) params.set("tag", merged.tag);
    if (merged.year) params.set("year", merged.year);
    if (merged.q) params.set("q", merged.q);
    if (merged.fav) params.set("fav", "1");
    // 透传当前视图，点筛选 chip 不重置视图；calendar 是月份文件夹特殊模式，不透传（点 chip 即退出）
    if (sp.view && sp.view !== "calendar") params.set("view", sp.view);
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  // 日历视图：全量轻量数据按月分组平铺
  const calendarData = view === "calendar" ? await listPhotosCalendar() : null;

  // 单月视图数据
  const monthIdx = month ? calendarMonths.findIndex((m) => m.ym === month) : -1;
  const listing =
    calendarData === null
      ? await listPhotos({ categorySlug: sp.category, tag: sp.tag, year, q, favorite: fav, month })
      : null;
  const total = listing ? listing.total : 0;
  const pageSize = listing ? listing.pageSize : 60;
  const items = listing ? listing.items : [];
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
        totalAll={month || view === "calendar" ? calendarMonths.reduce((s, m) => s + m.count, 0) : total}
        totalFav={favCount}
        sp={{ category: sp.category, tag: sp.tag, year: sp.year, q: sp.q, fav: sp.fav, view: sp.view, month: sp.month }}
      />

      <div className="min-w-0">
        {/* 移动端筛选栏（PC 走左侧栏） */}
        <div className="flex lg:hidden flex-wrap items-center gap-2 mb-5 text-sm">
          <FilterLink href={qs({ category: null, tag: null, year: null, q: null, fav: null })} active={!sp.category && !sp.tag && !sp.year && !fav && !month}>
            全部
          </FilterLink>
          {fav ? null : <FilterLink href={qs({ fav: true })} active={fav}>★ 收藏</FilterLink>}
          <FilterLink href="/?view=calendar" active={view === "calendar"}>
            日历
          </FilterLink>
          {categories.map((c) => (
            <FilterLink key={c.id} href={qs({ category: c.slug })} active={sp.category === c.slug}>
              {c.name}
              {c.count > 0 ? <span className="opacity-50 ml-1">{c.count}</span> : null}
            </FilterLink>
          ))}
          {years.map((y) => (
            <FilterLink key={y.year} href={qs({ year: y.year })} active={sp.year === String(y.year)}>
              {y.year}
            </FilterLink>
          ))}
        </div>

        {month ? (
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
        ) : view === "calendar" ? (
          <h1 className="text-xl font-semibold mb-6">日历</h1>
        ) : null}

        {calendarData ? (
          <CalendarView months={calendarData} />
        ) : (
          <PhotoGrid
            key={`${sp.category ?? ""}|${sp.tag ?? ""}|${sp.year ?? ""}|${q ?? ""}|${fav ? "fav" : ""}|${view}|${month ?? ""}|${total}`}
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
      className={`rounded-full border px-3 py-1 transition-colors ${
        active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
