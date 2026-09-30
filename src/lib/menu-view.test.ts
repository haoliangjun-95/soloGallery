import { describe, expect, it } from "vitest";
import {
  MENU_COLLAPSED_COUNT,
  collapsedMenuEntries,
  filterMenuEntries,
  menuQueryMatch,
} from "./menu-view";

describe("menuQueryMatch", () => {
  it("空查询（含纯空白）匹配一切", () => {
    expect(menuQueryMatch("西藏", "")).toBe(true);
    expect(menuQueryMatch("西藏", "   ")).toBe(true);
  });
  it("中文子串包含", () => {
    expect(menuQueryMatch("#演唱会", "演唱")).toBe(true);
    expect(menuQueryMatch("#演唱会", "拉萨")).toBe(false);
  });
  it("拉丁字母大小写不敏感", () => {
    expect(menuQueryMatch("Canon EOS R5", "canon")).toBe(true);
    expect(menuQueryMatch("Canon EOS R5", "EOS")).toBe(true);
    expect(menuQueryMatch("Canon EOS R5", "sony")).toBe(false);
  });
  it("年份可按数字子串匹配", () => {
    expect(menuQueryMatch("2025 年", "20")).toBe(true);
    expect(menuQueryMatch("2025 年", "202")).toBe(true);
  });
});

describe("filterMenuEntries", () => {
  const entries = [{ label: "西藏" }, { label: "深圳" }, { label: "#旅行" }];
  it("空查询返回原引用（零拷贝）", () => {
    expect(filterMenuEntries(entries, " ")).toBe(entries);
    expect(filterMenuEntries(entries, "")).toBe(entries);
  });
  it("按 label 过滤且不修改入参", () => {
    const out = filterMenuEntries(entries, "深");
    expect(out).toEqual([{ label: "深圳" }]);
    expect(entries).toHaveLength(3);
  });
});

describe("collapsedMenuEntries", () => {
  const mk = (n: number, activeAt?: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `item-${i}`, active: i === activeAt }));

  it("不足上限原引用返回、无隐藏", () => {
    const entries = mk(MENU_COLLAPSED_COUNT);
    const view = collapsedMenuEntries(entries);
    expect(view.visible).toBe(entries);
    expect(view.hiddenCount).toBe(0);
  });
  it("超上限折叠到上限项，隐藏数正确", () => {
    const view = collapsedMenuEntries(mk(20));
    expect(view.visible).toHaveLength(MENU_COLLAPSED_COUNT);
    expect(view.hiddenCount).toBe(12);
  });
  it("折叠隐藏区里的激活项补显在尾部，不计入隐藏数", () => {
    const view = collapsedMenuEntries(mk(20, 15));
    expect(view.visible).toHaveLength(MENU_COLLAPSED_COUNT + 1);
    expect(view.visible.at(-1)?.label).toBe("item-15");
    expect(view.hiddenCount).toBe(11);
  });
  it("前缀区内的激活项不重复补显", () => {
    const view = collapsedMenuEntries(mk(20, 3));
    expect(view.visible).toHaveLength(MENU_COLLAPSED_COUNT);
    expect(view.hiddenCount).toBe(12);
  });
});
