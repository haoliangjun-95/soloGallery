/**
 * 评论展示纯函数层单测（功能 13）：分页切片 / 步进 / 计数预警阈值。
 * COMMENT_CONTENT_MAX 与评论 API zod 上限、textarea maxLength 单一出处。
 */
import { describe, expect, test } from "vitest";
import {
  COMMENT_CONTENT_MAX,
  COMMENT_PAGE_SIZE,
  expandVisible,
  isNearCommentLimit,
  sliceComments,
} from "./comment-view";

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("常量契约", () => {
  test("每页 5 条、上限 2000（与 route zod/textarea 一致）", () => {
    expect(COMMENT_PAGE_SIZE).toBe(5);
    expect(COMMENT_CONTENT_MAX).toBe(2000);
  });
});

describe("sliceComments", () => {
  test("默认切片前 PAGE_SIZE 条", () => {
    expect(sliceComments(nums(12), COMMENT_PAGE_SIZE, false)).toEqual([1, 2, 3, 4, 5]);
  });

  test("expandedAll 返回全量（原引用，零拷贝）", () => {
    const all = nums(12);
    expect(sliceComments(all, COMMENT_PAGE_SIZE, true)).toBe(all);
  });

  test("visible ≥ 总数返回原引用（不产生无谓新数组）", () => {
    const all = nums(3);
    expect(sliceComments(all, 5, false)).toBe(all);
  });

  test("空列表原样返回", () => {
    const empty: number[] = [];
    expect(sliceComments(empty, 5, false)).toBe(empty);
  });

  test("不修改入参", () => {
    const all = nums(12);
    const before = [...all];
    sliceComments(all, 5, false);
    expect(all).toEqual(before);
    expect(all.length).toBe(12);
  });
});

describe("expandVisible", () => {
  test("步进 +PAGE_SIZE", () => {
    expect(expandVisible(5, 100)).toBe(10);
  });

  test("封顶到总数（继续步进无意义）", () => {
    expect(expandVisible(8, 12)).toBe(12);
    expect(expandVisible(12, 12)).toBe(12);
  });
});

describe("isNearCommentLimit", () => {
  test("低于 90% 不预警", () => {
    expect(isNearCommentLimit(0)).toBe(false);
    expect(isNearCommentLimit(COMMENT_CONTENT_MAX * 0.9 - 1)).toBe(false);
  });

  test("达到 90% 预警（提醒用户上限将至，而非 maxLength 静默截断）", () => {
    expect(isNearCommentLimit(COMMENT_CONTENT_MAX * 0.9)).toBe(true);
    expect(isNearCommentLimit(COMMENT_CONTENT_MAX)).toBe(true);
  });
});
