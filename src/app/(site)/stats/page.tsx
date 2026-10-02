import Link from "next/link";
import { buildFilterUrl } from "@/lib/filter-url";
import { barPercent, formatBytes, formatYearSpan, tagCloudLevel, yearTrendBars } from "@/lib/stats";
import {
  countFavorites,
  getGalleryStats,
  listCategories,
  listGear,
  listTags,
  listYears,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "统计 · soloGallery" };

/** 标签云 5 档字号/透明度（tagCloudLevel 的展示面） */
const TAG_LEVEL_CLASS: Record<number, string> = {
  1: "text-xs text-white/50",
  2: "text-sm text-white/60",
  3: "text-base text-white/75",
  4: "text-lg text-white/90",
  5: "text-xl text-white font-medium",
};

export default async function StatsPage() {
  const [stats, years, gear, tags, categories, favorites] = await Promise.all([
    getGalleryStats(),
    listYears(true),
    listGear(true),
    listTags(true),
    listCategories(true),
    countFavorites(),
  ]);

  const trend = yearTrendBars(years);
  const span = formatYearSpan(stats.earliest, stats.latest);
  const cameras = gear.cameras.slice(0, 6);
  const lenses = gear.lenses.slice(0, 6);
  const maxCam = cameras[0]?.count ?? 0;
  const maxLens = lenses[0]?.count ?? 0;
  const cats = categories.filter((c) => c.count > 0).slice(0, 8);
  const maxCat = cats[0]?.count ?? 0;
  const cloud = tags.filter((t) => t.count > 0);
  const minTag = cloud.length ? Math.min(...cloud.map((t) => t.count)) : 0;
  const maxTag = cloud.length ? Math.max(...cloud.map((t) => t.count)) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">统计</h1>
        <p className="mt-1 text-sm text-muted">按拍摄时间的年度趋势、器材与题材的使用分布。</p>
      </header>

      {/* 总览瓦片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-edge bg-card p-4">
          <p className="text-xs text-muted">照片</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-card p-4">
          <p className="text-xs text-muted">原图体积</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBytes(stats.bytes)}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-card p-4">
          <p className="text-xs text-muted">收藏</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{favorites}</p>
        </div>
        <div className="rounded-2xl border border-edge bg-card p-4">
          <p className="text-xs text-muted">拍摄跨度</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{span ?? "—"}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-edge bg-card p-4 md:col-span-4 lg:col-span-1">
          <p className="text-xs text-muted">含位置信息</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {stats.withGps}
            <span className="ml-1 text-sm font-normal text-muted">/ {stats.total}</span>
          </p>
        </div>
      </div>

      {/* 年度趋势 */}
      <section className="mt-6 rounded-2xl border border-edge bg-card p-5" aria-labelledby="stats-trend">
        <h2 id="stats-trend" className="mb-4 text-sm font-medium text-muted">
          年度趋势（按拍摄时间）
        </h2>
        {trend.length === 0 ? (
          <p className="text-sm text-muted">暂无拍摄时间数据。</p>
        ) : (
          <div className="flex items-end gap-2 sm:gap-3" style={{ height: `${Math.max(160, trend.length * 24)}px` }}>
            {trend.map((bar) => (
              <Link
                key={bar.year}
                href={buildFilterUrl({}, { year: String(bar.year) }, { unset: "clear" })}
                title={`${bar.year} 年 · ${bar.count} 张`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
              >
                <span className="text-xs text-muted tabular-nums group-hover:text-foreground">{bar.count}</span>
                <span
                  aria-hidden
                  className="w-full max-w-16 rounded-t-md bg-white/15 transition-colors group-hover:bg-[#f5b43c]/70"
                  style={{ height: `${bar.pct}%` }}
                />
                <span className="truncate text-xs text-muted tabular-nums">{bar.year}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 器材 */}
        <section className="rounded-2xl border border-edge bg-card p-5" aria-labelledby="stats-gear">
          <h2 id="stats-gear" className="mb-4 text-sm font-medium text-muted">
            器材使用
          </h2>
          {cameras.length + lenses.length === 0 ? (
            <p className="text-sm text-muted">暂无器材数据。</p>
          ) : (
            <div className="space-y-5">
              <BarList
                label="机身"
                items={cameras.map((c) => ({
                  label: c.label,
                  count: c.count,
                  href: buildFilterUrl({}, { make: c.make, model: c.model }, { unset: "clear" }),
                }))}
                max={maxCam}
              />
              <BarList
                label="镜头"
                items={lenses.map((l) => ({
                  label: l.lens,
                  count: l.count,
                  href: buildFilterUrl({}, { lens: l.lens }, { unset: "clear" }),
                }))}
                max={maxLens}
              />
            </div>
          )}
        </section>

        {/* 分类 */}
        <section className="rounded-2xl border border-edge bg-card p-5" aria-labelledby="stats-category">
          <h2 id="stats-category" className="mb-4 text-sm font-medium text-muted">
            题材分布
          </h2>
          {cats.length === 0 ? (
            <p className="text-sm text-muted">暂无分类数据。</p>
          ) : (
            <div className="space-y-2">
              {cats.map((c) => (
                <Link
                  key={c.id}
                  href={buildFilterUrl({}, { category: c.slug }, { unset: "clear" })}
                  className="group flex items-center gap-3 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
                >
                  <span className="w-24 shrink-0 truncate text-sm group-hover:text-[#f5b43c]">{c.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      aria-hidden
                      className="block h-full rounded-full bg-white/25 transition-colors group-hover:bg-[#f5b43c]/70"
                      style={{ width: `${barPercent(c.count, maxCat)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">{c.count}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 标签云 */}
      <section className="mt-6 rounded-2xl border border-edge bg-card p-5" aria-labelledby="stats-tags">
        <h2 id="stats-tags" className="mb-4 text-sm font-medium text-muted">
          标签云（{cloud.length} 个）
        </h2>
        {cloud.length === 0 ? (
          <p className="text-sm text-muted">暂无标签数据。</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {cloud.map((t) => (
              <Link
                key={t.id}
                href={buildFilterUrl({}, { tag: t.name }, { unset: "clear" })}
                title={`${t.count} 张`}
                className={`rounded transition-colors hover:text-[#f5b43c] ${TAG_LEVEL_CLASS[tagCloudLevel(t.count, minTag, maxTag)]}`}
              >
                #{t.name}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 横向占比条列表（机身/镜头共用）：label 可点、条宽按 count/max。 */
function BarList({ label, items, max }: { label: string; items: { label: string; count: number; href: string }[]; max: number }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs text-muted">{label}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className="group flex items-center gap-3 rounded-lg py-0.5 focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
          >
            <span className="w-40 shrink-0 truncate text-sm group-hover:text-[#f5b43c]" title={item.label}>
              {item.label}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                aria-hidden
                className="block h-full rounded-full bg-white/25 transition-colors group-hover:bg-[#f5b43c]/70"
                style={{ width: `${barPercent(item.count, max)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
