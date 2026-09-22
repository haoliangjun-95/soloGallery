import { describe, expect, it } from "vitest";
import { DISPLAY_QUALITY, DISPLAY_WIDTH, displayKey, originalKey } from "./bucket-layout";

const SHA1 = "a".repeat(40);

describe("bucket-layout", () => {
  it("原图键是内容寻址的 objects/<sha1>（与壁纸软件约定一致）", () => {
    expect(originalKey(SHA1)).toBe(`objects/${SHA1}`);
  });

  it("display 变体键带 .webp 后缀", () => {
    expect(displayKey(SHA1)).toBe(`display/${SHA1}.webp`);
  });

  it("display 参数在合理范围内", () => {
    expect(DISPLAY_WIDTH).toBeGreaterThan(0);
    expect(DISPLAY_QUALITY).toBeGreaterThan(0);
    expect(DISPLAY_QUALITY).toBeLessThanOrEqual(100);
  });
});
