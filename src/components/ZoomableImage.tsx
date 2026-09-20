"use client";

import { useEffect, useState } from "react";

export default function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
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
        <img src={src} alt={alt} className="w-full h-auto block" loading="eager" decoding="async" />
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
