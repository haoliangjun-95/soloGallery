import { describe, expect, it } from "vitest";
import { DISPLAY_TZ, displayMonthKey, monthBounds, yearBounds } from "./time";

describe("yearBounds", () => {
  it("按东八区零点算年边界（UTC 上是前一天 16:00）", () => {
    const b = yearBounds(2026);
    expect(b.gte.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(b.lt.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("monthBounds", () => {
  it("普通月份取到次月 1 日零点", () => {
    const b = monthBounds("2026-05");
    expect(b?.gte.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(b?.lt.toISOString()).toBe("2026-05-31T16:00:00.000Z");
  });

  it("12 月跨年进位到次年 1 月", () => {
    const b = monthBounds("2026-12");
    expect(b?.gte.toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(b?.lt.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("格式非法返回 null", () => {
    expect(monthBounds("2026-5")).toBeNull();
    expect(monthBounds("abc")).toBeNull();
    expect(monthBounds("")).toBeNull();
  });

  it("月份越界返回 null", () => {
    expect(monthBounds("2026-00")).toBeNull();
    expect(monthBounds("2026-13")).toBeNull();
  });
});

describe("displayMonthKey", () => {
  it("UTC 跨月的时刻按展示时区归到次月", () => {
    expect(displayMonthKey(new Date("2025-12-31T16:30:00Z"))).toBe("2026-01");
  });

  it("同一天的 UTC 上午仍在当月", () => {
    expect(displayMonthKey(new Date("2026-02-12T07:55:00Z"))).toBe("2026-02");
  });
});

describe("DISPLAY_TZ", () => {
  it("是 Intl 可识别的时区名", () => {
    expect(() => new Intl.DateTimeFormat("en", { timeZone: DISPLAY_TZ })).not.toThrow();
  });
});
