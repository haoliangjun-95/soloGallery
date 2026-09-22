/**
 * 轻量日志器：统一 `[sologallery][scope]` 前缀，业务代码不再直接散落 console.*。
 * solo 项目不引三方依赖，输出仍走 console；后续如需接入正式日志库只改这一处。
 * 注意：不依赖 server-only —— sync.ts 会被 tsx 脚本（scripts/run-sync.mts）导入。
 */

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

function formatExtra(extra: unknown): string {
  if (extra instanceof Error) return extra.stack ?? `${extra.name}: ${extra.message}`;
  if (typeof extra === "string") return extra;
  return JSON.stringify(extra);
}

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  const line = `[sologallery][${scope}] ${message}`;
  const payload = extra === undefined ? line : `${line} ${formatExtra(extra)}`;
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

/** 按模块创建带作用域前缀的日志器：createLogger("sync") → [sologallery][sync] ... */
export function createLogger(scope: string): Logger {
  return {
    info: (message, extra) => emit("info", scope, message, extra),
    warn: (message, extra) => emit("warn", scope, message, extra),
    error: (message, extra) => emit("error", scope, message, extra),
  };
}
