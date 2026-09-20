"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 详情页返回：ESC 退出（灯箱打开时优先关灯箱）+ 悬浮关闭按钮。 */
export default function BackOnEsc() {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 灯箱（全屏放大）打开时由它自己消费 ESC，先关灯箱不退页
      if (document.body.dataset.lightbox === "1") return;
      router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="关闭预览"
      title="关闭预览（ESC）"
      className="fixed top-20 right-4 lg:right-6 z-30 h-10 w-10 rounded-full border border-edge bg-background/80 backdrop-blur flex items-center justify-center text-muted hover:text-foreground text-2xl leading-none"
    >
      ×
    </button>
  );
}
