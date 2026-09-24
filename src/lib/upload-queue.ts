/**
 * 上传队列纯函数层（功能 12）：汇总计数 + 超限预检。
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
