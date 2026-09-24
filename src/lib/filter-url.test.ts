import { describe, expect, it } from "vitest";
import { buildFilterUrl, photoHref } from "./filter-url";

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

describe("photoHref — 详情页上下文透传", () => {
  it("无上下文时返回裸详情链接", () => {
    expect(photoHref("abc123")).toBe("/photo/abc123");
    expect(photoHref("abc123", {})).toBe("/photo/abc123");
  });

  it("上下文按 category,tag,year,q,fav,month 规范顺序序列化", () => {
    expect(
      photoHref("abc123", { month: "2024-06", fav: true, q: "x", year: 2024, tag: "t", category: "c" }),
    ).toBe("/photo/abc123?category=c&tag=t&year=2024&q=x&fav=1&month=2024-06");
  });

  it("空值/undefined/false 一律不输出", () => {
    expect(photoHref("abc123", { category: "", q: undefined, fav: false, month: "" })).toBe(
      "/photo/abc123",
    );
  });

  it("fav 为 true 时输出 1（对齐首页 fav 语义）", () => {
    expect(photoHref("abc123", { fav: true })).toBe("/photo/abc123?fav=1");
  });

  it("值经 URL 编码且可往返解析", () => {
    const href = photoHref("abc123", { tag: "海边日落", q: "sun set" });
    const parsed = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(parsed.get("tag")).toBe("海边日落");
    expect(parsed.get("q")).toBe("sun set");
  });
});
