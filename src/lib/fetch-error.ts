/**
 * 客户端 fetch 错误提取 —— 后端统一 { error: string } 信封，
 * 这里把非 2xx 响应转成可展示给用户的一句话，避免静默失败。
 */
export async function responseError(res: Response, fallback?: string): Promise<string> {
  const base = fallback ?? `请求失败（HTTP ${res.status}）`;
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data?.error === "string" && data.error ? data.error : base;
  } catch {
    return base;
  }
}

/** 网络异常等非响应错误 → 可读消息 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
