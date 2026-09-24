import { describe, expect, it } from "vitest";
import { buildFilterUrl } from "./filter-url";

const FULL_CURRENT = {
  category: "travel",
  tag: "sea",
  year: "2024",
  q: "sunset",
  fav: "1",
  view: "masonry",
} as const;

describe("buildFilterUrl — clear（Sidebar 互斥重置语义）", () => {
  it("无任何筛选时返回 /", () => {
    expect(buildFilterUrl({}, {})).toBe("/");
    expect(buildFilterUrl()).toBe("/");
  });

  it("未出现在 patch 的维度全部清空", () => {
    expect(buildFilterUrl(FULL_CURRENT, { category: "food" })).toBe("/?category=food");
  });

  it("patch 键显式传 null/undefined 同样清除该维度", () => {
    expect(buildFilterUrl(FULL_CURRENT, { category: null, tag: "sea" })).toBe("/?tag=sea");
    expect(buildFilterUrl(FULL_CURRENT, { category: undefined, tag: "sea" })).toBe("/?tag=sea");
  });

  it("fav 仅值恰好为 1 时序列化", () => {
    expect(buildFilterUrl({}, { fav: "1" })).toBe("/?fav=1");
    expect(buildFilterUrl({}, { fav: "0" })).toBe("/");
    expect(buildFilterUrl({}, { fav: "true" })).toBe("/");
  });

  it("view 可由 patch 显式设置为 calendar", () => {
    expect(buildFilterUrl({}, { q: "cat", view: "calendar" })).toBe("/?q=cat&view=calendar");
  });

  it("空字符串值不序列化", () => {
    expect(buildFilterUrl({}, { category: "" })).toBe("/");
  });

  it("参数按 category,tag,year,q,fav,view 规范顺序输出", () => {
    expect(
      buildFilterUrl({}, { view: "list", fav: "1", q: "x", year: "2024", tag: "t", category: "c" }),
    ).toBe("/?category=c&tag=t&year=2024&q=x&fav=1&view=list");
  });

  it("值经 URL 编码且可往返解析", () => {
    const url = buildFilterUrl({}, { tag: "海边日落" });
    const parsed = new URLSearchParams(url.slice("/?".length));
    expect(parsed.get("tag")).toBe("海边日落");
  });
});

describe("buildFilterUrl — keep（移动端 chips 叠加组合语义）", () => {
  it("未出现在 patch 的维度保留 current 值", () => {
    expect(buildFilterUrl(FULL_CURRENT, { category: "food" }, { unset: "keep" })).toBe(
      "/?category=food&tag=sea&year=2024&q=sunset&fav=1&view=masonry",
    );
  });

  it("patch 显式 null 清除单个维度，其余保留", () => {
    expect(buildFilterUrl(FULL_CURRENT, { tag: null }, { unset: "keep" })).toBe(
      "/?category=travel&year=2024&q=sunset&fav=1&view=masonry",
    );
  });

  it("current 的 view=calendar 不透传（点筛选即退出日历）", () => {
    expect(buildFilterUrl({ view: "calendar", q: "x" }, { category: "a" }, { unset: "keep" })).toBe(
      "/?category=a&q=x",
    );
  });

  it("一次性清空全部维度时仍保留非 calendar 视图（移动端「全部」入口）", () => {
    expect(
      buildFilterUrl(
        FULL_CURRENT,
        { category: null, tag: null, year: null, q: null, fav: null },
        { unset: "keep" },
      ),
    ).toBe("/?view=masonry");
  });
});
