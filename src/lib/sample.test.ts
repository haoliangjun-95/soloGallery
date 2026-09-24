import { describe, expect, it } from "vitest";
import { reservoirSample } from "./sample";

/** 确定性伪随机源：循环返回给定序列，锁定水塘替换行为（避免 flaky）。 */
function seededRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("reservoirSample", () => {
  it("空输入返回空数组", () => {
    expect(reservoirSample([], 5)).toEqual([]);
  });

  it("count 为 0 或负数返回空数组", () => {
    expect(reservoirSample([1, 2, 3], 0)).toEqual([]);
    expect(reservoirSample([1, 2, 3], -1)).toEqual([]);
  });

  it("count 不小于长度时返回全部（副本，顺序保持）", () => {
    expect(reservoirSample([1, 2, 3], 3)).toEqual([1, 2, 3]);
    expect(reservoirSample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it("结果长度为 count、无重复、且都来自源数组", () => {
    const src = Array.from({ length: 100 }, (_, i) => i);
    const out = reservoirSample(src, 10);
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
    for (const v of out) expect(src).toContain(v);
  });

  it("确定性随机源下按水塘算法替换：j >= count 不替换", () => {
    // i=3 时 j = floor(0.99 * 4) = 3，不小于 count=3 → 不替换
    expect(reservoirSample([1, 2, 3, 4], 3, seededRand([0.99]))).toEqual([1, 2, 3]);
  });

  it("确定性随机源下按水塘算法替换：j < count 替换对应位置", () => {
    // i=3 时 j = floor(0.5 * 4) = 2 → picked[2] = 4
    expect(reservoirSample([1, 2, 3, 4], 3, seededRand([0.5]))).toEqual([1, 2, 4]);
  });

  it("不修改输入数组（不可变性）", () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    reservoirSample(src, 2);
    expect(src).toEqual(copy);
  });
});
