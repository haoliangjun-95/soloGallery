/**
 * 上传队列纯函数层单测（功能 12）：summarizeQueue / isOversized / MAX_FILE_BYTES。
 * 汇总口径：settled = 队列非空且全部到达终态（done/exists/error）——
 * 「队列结束显示成功/跳过/失败汇总」的展示时机。
 * 超限预检在上传前本地拦截（不浪费带宽打服务端；服务端 route.ts 同一常量兜底）。
 */
import { describe, expect, test } from "vitest";
import { MAX_FILE_BYTES, isOversized, summarizeQueue } from "./upload-queue";
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
});
