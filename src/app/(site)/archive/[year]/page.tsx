import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseYear, photoHref } from "@/lib/filter-url";
import { listArchiveYear, listYears } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** 显式声明而非 PageProps<"/archive/[year]">：.next/types/routes.d.ts 的 AppRoutes
 *  联合由 next dev/build 再生成，新路由未注册前泛型实参会挂 tsc（/map 页同款姿态）。 */
interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const parsed = parseYear(year);
  return { title: parsed ? `${parsed} 年度归档` : "年度归档" };
}

/**
 * 年度归档页（功能 16）：/archive/2025 —— 按月分节的年度长页，每月收藏优先精选
 * 至多 8 张（archive.ts ARCHIVE_PER_MONTH），比日历视图更轻的回顾入口。
 * - 年份参数与首页/详情页同源 parseYear（1971..9998），非法/越界直接 404，不进 Prisma
 * - 无照片的年份不生成归档页（与年份 chips 只列有照片年份一致）
 * - 上/下年导航只链接有照片的年份（listYears 降序相邻），天然不 404
 */
export default async function ArchivePage({ params }: Props) {
  const { year: yearRaw } = await params;
  const year = parseYear(yearRaw);
  if (!year) notFound();

  const [months, years] = await Promise.all([listArchiveYear(year), listYears()]);
  if (months.length === 0) notFound();

  const total = months.reduce((sum, m) => sum + m.total, 0);
  // years 降序（新→旧）：索引小的是更晚的年份
  const idx = years.findIndex((y) => y.year === year);
  const newer = idx > 0 ? years[idx - 1] : undefined;
  const older = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">
          {year} 年度归档{" "}
          <span className="text-sm text-muted font-normal">
            {total} 张 · {months.length} 个月
          </span>
        </h1>
        <p className="text-sm text-muted">每月精选至多 8 张，收藏优先</p>
      </div>

      <nav aria-label="年份导航" className="mb-8 mt-4 flex flex-wrap items-center gap-2 text-sm">
        {older ? (
          <YearLink href={`/archive/${older.year}`} title={`${older.year} 年（${older.count} 张）`}>
            ‹ {older.year}
          </YearLink>
        ) : null}
        <YearLink href="/?view=calendar" title="按月份浏览全部照片">
          日历
        </YearLink>
        {newer ? (
          <YearLink href={`/archive/${newer.year}`} title={`${newer.year} 年（${newer.count} 张）`}>
            {newer.year} ›
          </YearLink>
        ) : null}
      </nav>

      <div className="space-y-12">
        {months.map((m) => (
          <section key={m.ym} aria-labelledby={`archive-${m.ym}`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`archive-${m.ym}`} className="text-lg font-semibold">
                {m.month} 月{" "}
                <span className="text-sm text-muted font-normal">
                  {m.total} 张
                  {m.total > m.photos.length ? ` · 精选 ${m.photos.length}` : ""}
                </span>
              </h2>
              <Link
                href={`/?month=${m.ym}`}
                className="text-sm text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
              >
                查看本月全部 →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {m.photos.map((p) => (
                <Link
                  key={p.sha1}
                  // 翻页上下文与 /?month= 视图一致：详情页 ←/→ 在该月全集内翻页
                  href={photoHref(p.sha1, { month: m.ym })}
                  title={p.title}
                  className="group block focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-card">
                    {/* 图片为 MinIO 公共读 WebP 缩略变体，无需走 next/image 优化代理（PhotoGrid/CalendarView 同款） */}
                    <img
                      src={p.thumbUrl}
                      alt={p.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {p.favorite ? (
                      /* role="img" 让 aria-label 生效——无 role 的泛型元素上 aria-label 被辅助技术忽略（评审 L-3） */
                      <span
                        role="img"
                        aria-label="收藏"
                        className="absolute left-2 top-2 text-base text-amber-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                      >
                        ★
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-sm text-foreground/75 transition-colors group-hover:text-foreground">
                    {p.title}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** 年份导航按钮：外观对齐首页单月视图的 prev/next 胶囊（page.tsx 同款类名） */
function YearLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
      className="rounded-full border border-edge px-3 py-1 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
    >
      {children}
    </Link>
  );
}
