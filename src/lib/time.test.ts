import { describe, expect, it } from "vitest";
import {
  DISPLAY_TZ,
  displayMonthDay,
  displayMonthKey,
  monthBounds,
  monthDayBoundsInYear,
  yearBounds,
} from "./time";

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

describe("displayMonthDay", () => {
  it("UTC 16:30 在东八区已跨到次日", () => {
    expect(displayMonthDay(new Date("2026-09-23T16:30:00Z"))).toBe("09-24");
  });

  it("UTC 上午仍在展示时区同一天", () => {
    expect(displayMonthDay(new Date("2026-03-05T02:00:00Z"))).toBe("03-05");
  });
});

describe("monthDayBoundsInYear", () => {
  it("东八区某年某月日的 [当日零点, 次日零点) 边界", () => {
    const b = monthDayBoundsInYear(2024, "09-24");
    expect(b?.gte.toISOString()).toBe("2024-09-23T16:00:00.000Z");
    expect(b?.lt.toISOString()).toBe("2024-09-24T16:00:00.000Z");
  });

  it("闰年 2 月 29 日有效", () => {
    const b = monthDayBoundsInYear(2024, "02-29");
    expect(b?.gte.toISOString()).toBe("2024-02-28T16:00:00.000Z");
    expect(b?.lt.toISOString()).toBe("2024-02-29T16:00:00.000Z");
  });

  it("平年 2 月 29 日返回 null（Date 会归一化到 3-01，round-trip 校验拒绝）", () => {
    expect(monthDayBoundsInYear(2026, "02-29")).toBeNull();
  });

  it("不存在的日期返回 null（4 月 31 日）", () => {
    expect(monthDayBoundsInYear(2026, "04-31")).toBeNull();
  });

  it("格式非法或月日越界返回 null", () => {
    expect(monthDayBoundsInYear(2026, "9-24")).toBeNull();
    expect(monthDayBoundsInYear(2026, "13-01")).toBeNull();
    expect(monthDayBoundsInYear(2026, "00-10")).toBeNull();
    expect(monthDayBoundsInYear(2026, "09-32")).toBeNull();
  });
});

describe("DISPLAY_TZ", () => {
  it("是 Intl 可识别的时区名", () => {
    expect(() => new Intl.DateTimeFormat("en", { timeZone: DISPLAY_TZ })).not.toThrow();
  });
});
