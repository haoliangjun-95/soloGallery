"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export interface NavTarget {
  href: string;
  title: string;
}

/**
 * 详情页上一张/下一张：悬浮圆形按钮 + ←/→ 键盘导航 + 下一张 prefetch。
 * href 由服务端按筛选上下文算好（photoHref），本组件只管导航交互。
 *
 * 键盘防御与 BackOnEsc 同一套约定：灯箱打开（body[data-lightbox="1"]）时
 * 让位给灯箱自身的按键处理；评论框等输入场景不劫持 ←/→。
 */
export default function PhotoNav({ prev, next }: { prev: NavTarget | null; next: NavTarget | null }) {
  const router = useRouter();

  // 预取列表中的下一张，键盘/点击翻页近似即时（prev 通常来自刚离开的列表页，已有缓存）
  useEffect(() => {
    if (next) router.prefetch(next.href);
  }, [router, next]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.body.dataset.lightbox === "1") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        return;
      }
      if (e.key === "ArrowLeft" && prev) router.push(prev.href);
      else if (e.key === "ArrowRight" && next) router.push(next.href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, prev, next]);

  if (!prev && !next) return null;

  const btn =
    "absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-background/70 text-lg leading-none text-muted backdrop-blur transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#f5b43c] focus-visible:outline-offset-2";

  return (
    <>
      {prev ? (
        <Link href={prev.href} aria-label={`上一张：${prev.title}`} title={`上一张：${prev.title}`} className={`${btn} left-2`}>
          ‹
        </Link>
      ) : null}
      {next ? (
        <Link href={next.href} aria-label={`下一张：${next.title}`} title={`下一张：${next.title}`} className={`${btn} right-2`}>
          ›
        </Link>
      ) : null}
    </>
  );
}
