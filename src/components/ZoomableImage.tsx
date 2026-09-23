"use client";

import { useEffect, useState } from "react";

export default function ZoomableImage({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    document.body.dataset.lightbox = "1"; // 详情页 ESC 据此让位：先关灯箱再退页
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      delete document.body.dataset.lightbox;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in rounded-xl overflow-hidden bg-card border border-edge"
        title="点击放大"
      >
        {/* 详情页 LCP 元素：显式宽高预留纵横比防 CLS，fetchPriority=high 提前调度 */}
        <img
          src={src}
          alt={alt}
          width={width ?? undefined}
          height={height ?? undefined}
          className="w-full h-auto block"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[94vh] max-w-[96vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-6 text-3xl text-white/80 hover:text-white leading-none"
            onClick={() => setOpen(false)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
