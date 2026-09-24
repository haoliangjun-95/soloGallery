"use client";

import { useRouter } from "next/navigation";

/**
 * "随机漫游"入口：点击 push `/?random=<时间戳 nonce>`。
 * nonce 保证每次点击 searchParams 都不同——同 URL 的重复导航会被
 * 路由层吞掉（不触发服务端重渲染），"换一批"就失效了。
 * 外观由调用方通过 className 注入（侧栏项 / 移动端 chip / 标题栏按钮）。
 */
export default function RandomWalkLink({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      title={title}
      onClick={() => router.push(`/?random=${Date.now()}`)}
      className={className}
    >
      {children}
    </button>
  );
}
