"use client";

/**
 * 管理端 mutation 公共状态机（功能 9）：busy 门 + error 收集 + 成功回流。
 * 4 个 Client 原先各自内联同一段 setBusy/setError/try-catch-finally/refresh
 * 样板（8+ 处重复），且 busy 覆盖不一致（Tags/Categories 的删除、重命名
 * 根本不置 busy，双击可重复发 DELETE）。收敛到单一 hook 后语义统一。
 *
 * 乐观更新（quiet 模式）：调用方自管 per-item pending，不置全局 busy——
 * run 返回 false 时调用方做行级回滚，error 已由 hook 写入（ErrorBanner 展示）。
 */
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { errorMessage, responseError } from "@/lib/fetch-error";

export interface AdminActionOptions {
  /** 成功后（router.refresh() 之前）调用：清空输入、清除选择等 */
  onSuccess?: () => void;
  /** 不置全局 busy（乐观更新的调用方自管 per-item pending） */
  quiet?: boolean;
  /** 成功后不自动 router.refresh()（默认回流服务端状态兜底一致性） */
  refresh?: boolean;
}

export function useAdminAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (url: string, init?: RequestInit, opts?: AdminActionOptions): Promise<boolean> => {
      if (!opts?.quiet) setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, init);
        // 失败不静默：后端 { error } 信封经 responseError 转可读消息进横幅
        if (!res.ok) {
          setError(await responseError(res));
          return false;
        }
        opts?.onSuccess?.();
        if (opts?.refresh !== false) router.refresh();
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        if (!opts?.quiet) setBusy(false);
      }
    },
    [router],
  );

  return { busy, error, setError, run };
}

/** JSON mutation 的 RequestInit 样板（Content-Type + 序列化），7 处调用点收敛 */
export function jsonInit(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
