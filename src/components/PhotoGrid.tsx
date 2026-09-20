"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoCardDTO } from "@/lib/types";

interface Props {
  initialItems: PhotoCardDTO[];
  total: number;
  pageSize: number;
  query?: { category?: string; tag?: string };
}

export default function PhotoGrid({ initialItems, total, pageSize, query }: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length >= total);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // initialItems 变化时的重置由父组件通过 key 重挂载实现（见各页面），
  // 避免 effect 内同步 setState 的级联渲染反模式。

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({ page: String(next) });
      if (query?.category) params.set("category", query.category);
      if (query?.tag) params.set("tag", query.tag);
      const res = await fetch(`/api/photos?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as { items: PhotoCardDTO[]; total: number };
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.sha1));
        return [...prev, ...data.items.filter((i) => !seen.has(i.sha1))];
      });
      setPage(next);
      setDone(next * pageSize >= data.total || data.items.length === 0);
    } catch {
      /* 网络抖动：下次滚动重试 */
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, pageSize, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (!items.length) {
    return (
      <div className="py-24 text-center text-muted">
        还没有图片 —— 去后台「从桶同步」或上传一些吧
      </div>
    );
  }

  return (
    <div>
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
        {items.map((photo) => (
          <a
            key={photo.sha1}
            href={`/photo/${photo.sha1}`}
            className="mb-3 block break-inside-avoid rounded-xl overflow-hidden bg-card border border-edge transition-transform hover:-translate-y-0.5"
          >
            {/* 图片为 MinIO 公共读 WebP 变体，无需走 next/image 优化代理 */}
            <img
              src={photo.thumbUrl}
              alt={photo.title}
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              loading="lazy"
              decoding="async"
              className="w-full h-auto block"
            />
          </a>
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />
      <div className="text-center text-xs text-muted pb-8">
        {done ? `共 ${total} 张` : loading ? "加载中…" : ""}
      </div>
    </div>
  );
}
