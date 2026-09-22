import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateAllow } from "./ratelimit";

/** 桶是模块级共享的，每个用例用独立 key 避免串味 */
let seq = 0;
function uniqueKey(): string {
  seq += 1;
  return `test:${seq}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("rateAllow", () => {
  it("额度内放行，超出后拒绝", () => {
    const key = uniqueKey();
    expect(rateAllow(key, 3, 60_000)).toBe(true);
    expect(rateAllow(key, 3, 60_000)).toBe(true);
    expect(rateAllow(key, 3, 60_000)).toBe(true);
    expect(rateAllow(key, 3, 60_000)).toBe(false);
  });

  it("不同 key 各自计数，互不影响", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    expect(rateAllow(a, 1, 60_000)).toBe(true);
    expect(rateAllow(a, 1, 60_000)).toBe(false);
    expect(rateAllow(b, 1, 60_000)).toBe(true);
  });

  it("窗口滑过后额度恢复", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T07:55:00.000Z"));
    const key = uniqueKey();
    expect(rateAllow(key, 1, 60_000)).toBe(true);
    expect(rateAllow(key, 1, 60_000)).toBe(false);

    vi.setSystemTime(new Date("2026-02-12T07:56:01.000Z"));
    expect(rateAllow(key, 1, 60_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("优先取 x-forwarded-for 的第一段", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 198.51.100.7" });
    expect(clientIp(headers)).toBe("203.0.113.5");
  });

  it("没有 forwarded 时退回 x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("都没有时返回 unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
