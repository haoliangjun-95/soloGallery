import { describe, expect, it } from "vitest";
import { buildFilterUrl, contextToParams, firstParam, parseYear, photoHref } from "./filter-url";

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

describe("firstParam — searchParams 重复参数归一化", () => {
  it("字符串原样返回", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam("")).toBe("");
  });

  it("数组取首元素（?q=a&q=b 运行时是数组，直调 .trim() 会抛 TypeError）", () => {
    expect(firstParam(["a", "b"])).toBe("a");
  });

  it("空数组与 undefined 归一为 undefined", () => {
    expect(firstParam([])).toBeUndefined();
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("parseYear — 年份参数校验（首页/详情页/API 三处同源）", () => {
  it("合法年份通过", () => {
    expect(parseYear("2024")).toBe(2024);
    expect(parseYear("1971")).toBe(1971);
    expect(parseYear("9998")).toBe(9998);
  });

  it("拒绝 1970 及更早", () => {
    expect(parseYear("1970")).toBeUndefined();
    expect(parseYear("1900")).toBeUndefined();
  });

  it("拒绝 9999 及以上（yearBounds 构造五位年份得 Invalid Date，进 Prisma 即 500）", () => {
    expect(parseYear("9999")).toBeUndefined();
    expect(parseYear("99999")).toBeUndefined();
  });

  it("拒绝非整数、非数字、空串与 undefined", () => {
    expect(parseYear("2024.5")).toBeUndefined();
    expect(parseYear("abc")).toBeUndefined();
    expect(parseYear("")).toBeUndefined();
    expect(parseYear(undefined)).toBeUndefined();
  });
});

describe("contextToParams — photoHref 与 loadMore 共用的上下文序列化", () => {
  it("按 category,tag,year,q,fav,month 规范顺序输出", () => {
    const params = contextToParams({ month: "2024-06", fav: true, q: "x", year: 2024, tag: "t", category: "c" });
    expect(params.toString()).toBe("category=c&tag=t&year=2024&q=x&fav=1&month=2024-06");
  });

  it("空上下文得空参数集", () => {
    expect(contextToParams({}).toString()).toBe("");
  });

  it("photoHref 即 contextToParams 的链接包装（两者恒一致）", () => {
    const ctx = { category: "c", year: 2024 } as const;
    expect(photoHref("abc123", ctx)).toBe(`/photo/abc123?${contextToParams(ctx).toString()}`);
  });
});

describe("器材词汇表（功能 3）— make/model/lens 维度（评审 M-1 补测）", () => {
  it("Sidebar 相机点击：新 make+model 组合清空 lens 维度（互斥重置语义，Sidebar 依赖此行为）", () => {
    expect(buildFilterUrl({ make: "Canon", model: "EOS R5", lens: "RF50" }, { make: "Sony", model: "A7M4" })).toBe(
      "/?make=Sony&model=A7M4",
    );
  });

  it("patch 显式 model: undefined 同样清除 model（相机链接不带 model 时防跨机型维度残留）", () => {
    expect(buildFilterUrl({ make: "Canon", model: "EOS R5" }, { make: "Sony", model: undefined })).toBe("/?make=Sony");
  });

  it("移动端「全部」chip：keep 模式一次性 null 清空全部器材维度，无残留视图时得 /", () => {
    expect(
      buildFilterUrl(
        { q: "sunset", make: "Canon", model: "EOS R5", lens: "RF50" },
        { q: null, make: null, model: null, lens: null },
        { unset: "keep" },
      ),
    ).toBe("/");
  });

  it("buildFilterUrl 按 category,make,model,lens,view 规范顺序序列化（FILTER_KEYS 重排会静默破坏既有链接，此测试即哨兵）", () => {
    expect(buildFilterUrl({}, { view: "fixed", lens: "L", model: "M2", make: "M1", category: "C" })).toBe(
      "/?category=C&make=M1&model=M2&lens=L&view=fixed",
    );
  });

  it("contextToParams 器材维度位于 fav 后 month 前（详情页/loadMore 词汇表同源同序）", () => {
    const params = contextToParams({ month: "2024-06", lens: "L", model: "M2", make: "M1", fav: true });
    expect(params.toString()).toBe("fav=1&make=M1&model=M2&lens=L&month=2024-06");
  });

  it("photoHref 透传器材上下文且值经 URL 编码可往返解析", () => {
    const href = photoHref("abc123", { make: "Canon", model: "EOS R5", lens: "RF 50mm" });
    expect(href).toBe("/photo/abc123?make=Canon&model=EOS+R5&lens=RF+50mm");
    expect(new URL(href, "http://x").searchParams.get("model")).toBe("EOS R5");
  });
});
