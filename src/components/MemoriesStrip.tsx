import Link from "next/link";
import type { MemoriesResult } from "@/lib/queries";

/**
 * "那年今日"横滑条：往年今天拍摄的照片按年分组，每组一行横向滚动缩略图。
 * 纯服务端组件——横滑用原生 overflow-x-auto，无客户端 JS。
 */
export default function MemoriesStrip({ memories }: { memories: MemoriesResult }) {
  if (!memories.groups.length) return null;
  const month = Number(memories.monthDay.slice(0, 2));
  const day = Number(memories.monthDay.slice(3, 5));

  return (
    <section
      aria-labelledby="memories-heading"
      className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id="memories-heading" className="text-sm font-semibold text-white/80">
          那年今天
        </h2>
        <span className="text-xs text-white/40">
          {month}月{day}日
        </span>
      </div>

      {memories.groups.map((g) => (
        <div key={g.year} className="mb-4 last:mb-0">
          <p className="mb-1.5 text-xs text-white/50">
            {g.yearsAgo} 年前 <span className="text-white/30">· {g.year}</span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {g.photos.map((p) => (
              <Link
                key={p.sha1}
                href={`/photo/${p.sha1}`}
                title={p.title}
                className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-card focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2"
              >
                {/* 缩略图为 MinIO 公共读变体，无需走 next/image 优化代理 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbUrl}
                  alt={p.title}
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {p.favorite ? (
                  <span className="absolute bottom-1 left-1 text-xs text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
                    ★
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
