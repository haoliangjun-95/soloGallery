import { describe, expect, it } from "vitest";
import { barPercent, formatBytes, formatYearSpan, tagCloudLevel, yearTrendBars } from "./stats";

describe("formatBytes", () => {
  it("逐级进位与保留位数", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3 TB");
  });
  it("非法输入回 0 B", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("yearTrendBars", () => {
  it("按年份升序并归一百分比", () => {
    const bars = yearTrendBars([
      { year: 2026, count: 100 },
      { year: 2024, count: 50 },
      { year: 2025, count: 25 },
    ]);
    expect(bars.map((b) => b.year)).toEqual([2024, 2025, 2026]);
    expect(bars.map((b) => b.pct)).toEqual([50, 25, 100]);
  });
  it("最小 4% 保底、空输入空数组、不修改入参序", () => {
    expect(yearTrendBars([{ year: 2024, count: 1 }, { year: 2025, count: 100 }])[0].pct).toBe(4);
    expect(yearTrendBars([])).toEqual([]);
    const input = [{ year: 2025, count: 2 }, { year: 2024, count: 1 }];
    yearTrendBars(input);
    expect(input[0].year).toBe(2025);
  });
});

describe("barPercent", () => {
  it("相对最大值取整、下限 2%", () => {
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(1, 5000)).toBe(2);
    expect(barPercent(100, 100)).toBe(100);
  });
  it("非法输入返回 0", () => {
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(10, 0)).toBe(0);
    expect(barPercent(-5, 100)).toBe(0);
  });
});

describe("tagCloudLevel", () => {
  it("相对区间离散成 5 档", () => {
    expect(tagCloudLevel(1, 1, 101)).toBe(1);
    expect(tagCloudLevel(25, 1, 101)).toBe(2);
    expect(tagCloudLevel(50, 1, 101)).toBe(3);
    expect(tagCloudLevel(75, 1, 101)).toBe(4);
    expect(tagCloudLevel(100, 1, 101)).toBe(5);
  });
  it("单一计数（min===max）落中档", () => {
    expect(tagCloudLevel(7, 7, 7)).toBe(3);
  });
});

describe("formatYearSpan", () => {
  it("跨年与同年", () => {
    expect(formatYearSpan(new Date("2020-05-01"), new Date("2026-09-01"))).toBe("2020 – 2026");
    expect(formatYearSpan(new Date("2026-01-01"), new Date("2026-12-31"))).toBe("2026");
  });
  it("缺任一端返回 null（min/max 顺序无关）", () => {
    expect(formatYearSpan(null, new Date())).toBeNull();
    expect(formatYearSpan(new Date("2026-09-01"), new Date("2020-05-01"))).toBe("2020 – 2026");
  });
});
