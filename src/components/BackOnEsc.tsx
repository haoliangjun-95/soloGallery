"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 详情页返回：ESC 退出（灯箱打开时优先关灯箱）+ 悬浮关闭按钮。
 *  回退策略：优先回到「最近列表页」面包屑（PhotoGrid 挂载时记录，含筛选参数）；
 *  无面包屑（直开/新标签/隐私模式）退回首页。刻意不用 router.back()——
 *  直开时它是空操作，新标签页则退到首项 about:blank，两种都表现为「点了没反应」。 */
export default function BackOnEsc() {
  const router = useRouter();

  function back() {
    let lastList: string | null = null;
    try {
      lastList = sessionStorage.getItem("sg:lastList");
    } catch {
      /* 存储被禁用：走首页兜底 */
    }
    // 只接受本站同源地址，防历史脏数据把 router.push 变成开放跳转
    if (lastList && lastList.startsWith(window.location.origin + "/")) {
      router.push(lastList);
    } else {
      router.push("/");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 灯箱（全屏放大）打开时由它自己消费 ESC，先关灯箱不退页
      if (document.body.dataset.lightbox === "1") return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- back 仅闭包 router，语义随 router 变化
  }, [router]);

  return (
    <button
      type="button"
      onClick={back}
      aria-label="关闭预览"
      title="关闭预览（ESC）"
      className="fixed top-20 right-4 lg:right-6 z-30 h-10 w-10 rounded-full border border-edge bg-background/80 backdrop-blur flex items-center justify-center text-muted hover:text-foreground text-2xl leading-none"
    >
      ×
    </button>
  );
}
