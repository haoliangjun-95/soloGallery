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
  const nextHref = next?.href;

  // 显式预取下一张，覆盖纯键盘路径（‹/› 是 Link，进视口才会自动预取）。
  // 注意：dynamic 路由的 prefetch 只热到 loading 骨架边界，完整页面仍需服务端往返。
  useEffect(() => {
    if (nextHref) router.prefetch(nextHref);
  }, [router, nextHref]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 长按方向键会以 ~30Hz 连发：每跳都触发 force-dynamic 渲染并污染历史栈，直接忽略 repeat
      if (e.repeat) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
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
