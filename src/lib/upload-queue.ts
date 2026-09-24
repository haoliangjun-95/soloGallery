/**
 * 上传队列纯函数层（功能 12）：汇总计数 + 超限预检 + HTTP outcome 终态判决。
 *
 * MAX_FILE_BYTES 是客户端/服务端的单一出处——客户端在上传前本地拦截超限文件
 * （用户立刻看到原因，不浪费带宽传完 30MB 才吃服务端的 error outcome）；
 * 服务端 route.ts 以同一常量兜底（绕过前端直连 API 依然被拒）。
 *
 * 队列项持有 File/XHR 引用，不适合进纯函数层——入参收敛为结构子集
 * （{status} / {size}），vitest 可直测；组件侧只管 XHR 与状态接线。
 */

/** 单文件上限 30MB：服务端把整图读进 Buffer（sha1/EXIF/webp 转换），防内存打满。
 *  route.ts 原为本地常量，收编于此供客户端预检与服务端执行共用 */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

/** 队列项生命周期：等待 → 上传中 → done（成功入库）/ exists（sha1 重复跳过）/ error（失败，可单项重试） */
export type QueueStatus = "pending" | "uploading" | "done" | "exists" | "error";

/** 超限预检（上限含边界：> 才拒，与服务端比较一致） */
export function isOversized(file: { size: number }): boolean {
  return file.size > MAX_FILE_BYTES;
}

export interface QueueSummary {
  pending: number;
  uploading: number;
  done: number;
  exists: number;
  error: number;
  /** 队列非空且全部到达终态（done/exists/error）——「成功/跳过/失败」汇总条的展示时机 */
  settled: boolean;
}

/** 终态判决结果：status 收敛到三种终态；progress 仅成功类给 100（error 保持原进度）；
 *  message 供 UI 展示原因（done 显式 undefined 清掉重试前的残留错误文案） */
export interface QueueOutcome {
  status: "done" | "exists" | "error";
  progress?: number;
  message?: string;
}

/** outcomes[0] 形状守卫：服务端契约 {status, sha1, error?}，外部数据不可信逐字段校验 */
function readOutcome(data: unknown): { status: string; error?: string } | null {
  if (!data || typeof data !== "object") return null;
  const outcomes = (data as { outcomes?: unknown }).outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) return null;
  const first: unknown = outcomes[0];
  if (!first || typeof first !== "object") return null;
  const { status, error } = first as { status?: unknown; error?: unknown };
  return {
    status: typeof status === "string" ? status : "",
    error: typeof error === "string" ? error : undefined,
  };
}

/**
 * HTTP outcome → 队列终态判决（评审收编 H-1/M-2 提纯）：服务端把逐文件错误
 * （sniff UNKNOWN/putBuffer 抛错等）装进 **HTTP 200** 的 outcomes 返回，旧组件
 * 映射只区分 exists、其余 2xx 一律 done——200+error outcome 被标「完成」成
 * 静默假成功。收编后仅 created→done；error→error；无法识别的形状一律 error
 * + HTTP 状态码兜底。data 为解析后的响应体（解析失败传 null）。
 */
export function toQueueOutcome(httpStatus: number, data: unknown): QueueOutcome {
  const outcome = readOutcome(data);
  if (httpStatus >= 200 && httpStatus < 300) {
    if (outcome?.status === "created") return { status: "done", progress: 100, message: undefined };
    if (outcome?.status === "exists") {
      return { status: "exists", progress: 100, message: "已存在（sha1 相同），跳过" };
    }
    return { status: "error", message: outcome?.status === "error" ? (outcome.error ?? `HTTP ${httpStatus}`) : `HTTP ${httpStatus}` };
  }
  const topError =
    data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? ((data as { error: string }).error)
      : undefined;
  return { status: "error", message: outcome?.error ?? topError ?? `HTTP ${httpStatus}` };
}

/** 按状态计数（不修改入参）；settled 供组件派生汇总条 */
export function summarizeQueue(items: readonly { status: QueueStatus }[]): QueueSummary {
  const summary: QueueSummary = {
    pending: 0,
    uploading: 0,
    done: 0,
    exists: 0,
    error: 0,
    settled: false,
  };
  for (const item of items) {
    summary[item.status] += 1;
  }
  summary.settled = items.length > 0 && summary.pending === 0 && summary.uploading === 0;
  return summary;
}
