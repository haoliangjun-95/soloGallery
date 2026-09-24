/**
 * 乐观更新纯函数层单测（功能 9）：patchById / removeById / insertAt。
 * 乐观流程 = 本地先行更新 → 失败回滚（反向 patch / 原位插回）。
 * 回滚正确性的核心是「只碰目标行」：不同行的并发乐观操作互不覆盖
 * （快照整体回滚会 clobber 他行的中间态，函数式逐行回滚不会）。
 */
import { describe, expect, test } from "vitest";
import { insertAt, patchById, removeById } from "./optimistic";

interface Row {
  id: number;
  name: string;
  flag: boolean;
}

const rows = (): Row[] => [
  { id: 1, name: "a", flag: false },
  { id: 2, name: "b", flag: true },
  { id: 3, name: "c", flag: false },
];

describe("patchById", () => {
  test("命中行应用补丁，返回新数组", () => {
    const input = rows();
    const out = patchById(input, 2, { flag: false });
    expect(out).not.toBe(input);
    expect(out.map((r) => r.flag)).toEqual([false, false, false]);
    expect(out[1].name).toBe("b");
  });

  test("不修改入参数组与目标对象（不可变）", () => {
    const input = rows();
    const before = JSON.stringify(input);
    patchById(input, 2, { flag: false, name: "changed" });
    expect(JSON.stringify(input)).toBe(before);
  });

  test("未命中行保持原引用（React 重渲染面最小）", () => {
    const input = rows();
    const out = patchById(input, 2, { flag: false });
    expect(out[0]).toBe(input[0]);
    expect(out[2]).toBe(input[2]);
    expect(out[1]).not.toBe(input[1]);
  });

  test("id 未命中：返回新数组，全部行引用不变", () => {
    const input = rows();
    const out = patchById(input, 999, { flag: true });
    expect(out).not.toBe(input);
    expect(out.length).toBe(3);
    out.forEach((r, i) => expect(r).toBe(input[i]));
  });

  test("反向补丁回滚：字段还原到原值", () => {
    const original = rows();
    const optimistic = patchById(original, 1, { flag: true });
    const rolledBack = patchById(optimistic, 1, { flag: original[0].flag });
    expect(rolledBack.map((r) => [r.id, r.flag])).toEqual(
      original.map((r) => [r.id, r.flag]),
    );
  });

  test("空数组返回空数组", () => {
    // 显式泛型实参：[] 字面量默认推断 never[]，Partial<never> 拒绝任何补丁字段
    expect(patchById<Row>([], 1, { flag: true })).toEqual([]);
  });
});

describe("removeById", () => {
  test("移除命中行，其余行顺序不变", () => {
    const out = removeById(rows(), 2);
    expect(out.map((r) => r.id)).toEqual([1, 3]);
  });

  test("不修改入参数组", () => {
    const input = rows();
    removeById(input, 1);
    expect(input.length).toBe(3);
  });

  test("id 未命中返回同内容新数组", () => {
    const input = rows();
    const out = removeById(input, 999);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });
});

describe("insertAt", () => {
  test("中间位置插入", () => {
    const out = insertAt([1, 2, 4], 2, 3);
    expect(out).toEqual([1, 2, 3, 4]);
  });

  test("index 0 头部插入", () => {
    expect(insertAt([2, 3], 0, 1)).toEqual([1, 2, 3]);
  });

  test("index === length 尾部追加", () => {
    expect(insertAt([1, 2], 2, 3)).toEqual([1, 2, 3]);
  });

  test("不修改入参数组", () => {
    const input = [1, 2];
    insertAt(input, 1, 9);
    expect(input).toEqual([1, 2]);
  });

  test("removeById 后按原 index 插回 = 恢复原序（删除回滚闭环）", () => {
    const input = rows();
    const index = input.findIndex((r) => r.id === 2);
    const removed = removeById(input, 2);
    const restored = insertAt(removed, index, input[index]);
    expect(restored).toEqual(input);
    expect(restored[1]).toBe(input[1]); // 同一对象引用插回
  });
});
