import Link from "next/link";
import type { MonthGroup } from "@/lib/queries";

/**
 * 日历视图（月份文件夹）：每月一张统一尺寸的封面卡片（该月倒序第一张），
 * 点击卡片进入该月全部图片 /?month=YYYY-MM。
 */
export default function CalendarView({ months }: { months: MonthGroup[] }) {
  if (!months.length) {
    return <div className="py-24 text-center text-muted">还没有带拍摄时间的图片</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {months.map((g) => {
        const cover = g.photos[0];
        return (
          <Link
            key={g.ym}
            href={`/?month=${g.ym}`}
            className="group block"
            title={`${g.year}年${g.month}月 · 共 ${g.count} 张`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-card">
              {cover ? (
                <img
                  src={cover.thumbUrl}
                  alt={`${g.year}年${g.month}月封面`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : null}
              {cover?.favorite ? (
                <span className="absolute left-2 top-2 text-amber-400 drop-shadow" aria-label="已收藏">
                  ★
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-sm font-medium text-white">
                {g.count} 张
              </span>
            </div>
            <p className="mt-2 truncate text-sm text-foreground/80 group-hover:text-foreground">
              {g.year}年{g.month}月
            </p>
          </Link>
        );
      })}
    </div>
  );
}
