/**
 * 上传队列纯函数层单测（功能 12）：summarizeQueue / isOversized / MAX_FILE_BYTES。
 * 汇总口径：settled = 队列非空且全部到达终态（done/exists/error）——
 * 「队列结束显示成功/跳过/失败汇总」的展示时机。
 * 超限预检在上传前本地拦截（不浪费带宽打服务端；服务端 route.ts 同一常量兜底）。
 */
import { describe, expect, test } from "vitest";
import { MAX_FILE_BYTES, isOversized, summarizeQueue, toQueueOutcome } from "./upload-queue";
import type { QueueStatus } from "./upload-queue";

const q = (...statuses: QueueStatus[]) => statuses.map((status) => ({ status }));

describe("MAX_FILE_BYTES", () => {
  test("30MB 与服务端上限一致", () => {
    expect(MAX_FILE_BYTES).toBe(30 * 1024 * 1024);
  });
});

describe("isOversized", () => {
  test("小于上限不超", () => {
    expect(isOversized({ size: MAX_FILE_BYTES - 1 })).toBe(false);
  });

  test("等于上限不超（含边界，与服务端 > 比较一致）", () => {
    expect(isOversized({ size: MAX_FILE_BYTES })).toBe(false);
  });

  test("超过上限即超", () => {
    expect(isOversized({ size: MAX_FILE_BYTES + 1 })).toBe(true);
  });
});

describe("summarizeQueue", () => {
  test("空队列：全零计数且未 settled（不显示汇总）", () => {
    expect(summarizeQueue([])).toEqual({
      pending: 0,
      uploading: 0,
      done: 0,
      exists: 0,
      error: 0,
      settled: false,
    });
  });

  test("混合队列：按状态计数", () => {
    expect(summarizeQueue(q("done", "done", "exists", "error", "pending"))).toEqual({
      pending: 1,
      uploading: 0,
      done: 2,
      exists: 1,
      error: 1,
      settled: false,
    });
  });

  test("uploading 未 settled", () => {
    expect(summarizeQueue(q("done", "uploading")).settled).toBe(false);
  });

  test("pending 未 settled", () => {
    expect(summarizeQueue(q("done", "pending")).settled).toBe(false);
  });

  test("全部终态：settled（汇总展示时机）", () => {
    expect(summarizeQueue(q("done", "exists", "error")).settled).toBe(true);
  });

  test("单一终态也 settled", () => {
    expect(summarizeQueue(q("done")).settled).toBe(true);
  });

  test("不修改入参", () => {
    const input = q("done", "error");
    const before = JSON.stringify(input);
    summarizeQueue(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("全 error 队列也 settled（评审收编补充）", () => {
    const s = summarizeQueue(q("error", "error"));
    expect(s.settled).toBe(true);
    expect(s.error).toBe(2);
  });
});

/**
 * HTTP outcome → 队列终态判决（评审收编 H-1/M-2）：
 * 服务端把逐文件错误装进 HTTP 200 的 outcomes（sniff UNKNOWN/putBuffer 抛错等），
 * 旧映射只区分 exists、其余 2xx 一律 done——200+error outcome 被标「完成」
 * 成静默假成功。提纯后：仅 created→done；error/无法识别→error。
 */
describe("toQueueOutcome", () => {
  test("2xx + created → done（进度 100，清残留 message）", () => {
    expect(toQueueOutcome(200, { outcomes: [{ status: "created", sha1: "abc" }] })).toEqual({
      status: "done",
      progress: 100,
      message: undefined,
    });
  });

  test("2xx + exists → exists（跳过文案）", () => {
    const out = toQueueOutcome(200, { outcomes: [{ status: "exists", sha1: "abc" }] });
    expect(out.status).toBe("exists");
    expect(out.progress).toBe(100);
    expect(out.message).toContain("已存在");
  });

  test("H-1 反例：2xx + error outcome → error（SVG 等 200 假成功场景）", () => {
    expect(
      toQueueOutcome(200, { outcomes: [{ status: "error", error: "无法识别的图片格式", sha1: "" }] }),
    ).toEqual({ status: "error", message: "无法识别的图片格式" });
  });

  test("2xx + error outcome 无 error 文案 → HTTP 状态码兜底", () => {
    expect(toQueueOutcome(200, { outcomes: [{ status: "error" }] })).toEqual({
      status: "error",
      message: "HTTP 200",
    });
  });

  test("2xx + outcomes 缺失/空数组/元素形状漂移 → error（不再默认 done）", () => {
    expect(toQueueOutcome(200, {}).status).toBe("error");
    expect(toQueueOutcome(200, { outcomes: [] }).status).toBe("error");
    expect(toQueueOutcome(200, { outcomes: [42] }).status).toBe("error");
    expect(toQueueOutcome(200, { outcomes: [{ status: "weird" }] }).status).toBe("error");
  });

  test("非 2xx：outcomes[0].error 优先，其次顶层 error，最后 HTTP 状态码", () => {
    expect(
      toQueueOutcome(400, { outcomes: [{ status: "error", error: "文件超过 30MB 上限" }] }).message,
    ).toBe("文件超过 30MB 上限");
    expect(toQueueOutcome(400, { error: "缺少 files" }).message).toBe("缺少 files");
    expect(toQueueOutcome(500, {}).message).toBe("HTTP 500");
  });

  test("JSON 解析失败（data=null）→ error + HTTP 状态码", () => {
    expect(toQueueOutcome(502, null)).toEqual({ status: "error", message: "HTTP 502" });
  });

  test("error 字段非字符串被忽略（外部数据不可信）", () => {
    expect(toQueueOutcome(200, { outcomes: [{ status: "error", error: 42 }] }).message).toBe(
      "HTTP 200",
    );
    expect(toQueueOutcome(400, { error: { nested: true } }).message).toBe("HTTP 400");
  });

  test("不修改入参 data", () => {
    const data = { outcomes: [{ status: "error", error: "x" }] };
    const before = JSON.stringify(data);
    toQueueOutcome(200, data);
    expect(JSON.stringify(data)).toBe(before);
  });
});
