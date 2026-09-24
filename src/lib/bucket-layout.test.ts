import { describe, expect, it } from "vitest";
import {
  buildGridSrcset,
  DISPLAY_QUALITY,
  DISPLAY_WIDTH,
  displayKey,
  GRID_QUALITY,
  GRID_WIDTHS,
  gridKey,
  originalKey,
} from "./bucket-layout";

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

describe("grid 网格变体（功能 10）", () => {
  it("grid 键落在已公开读的 display/ 前缀下：display/<sha1>-<w>w.webp（桶策略零改动）", () => {
    expect(gridKey(SHA1, 400)).toBe(`display/${SHA1}-400w.webp`);
    expect(gridKey(SHA1, 800)).toBe(`display/${SHA1}-800w.webp`);
  });

  it("grid 档位契约：升序、全部小于 display 宽（≥display 宽的档位无意义）、质量不超 display", () => {
    expect(GRID_WIDTHS).toEqual([400, 800]);
    for (const w of GRID_WIDTHS) expect(w).toBeLessThan(DISPLAY_WIDTH);
    expect(GRID_QUALITY).toBeGreaterThan(0);
    expect(GRID_QUALITY).toBeLessThanOrEqual(DISPLAY_QUALITY);
  });

  it("buildGridSrcset：每档一条 '<url> <w>w'，升序，逗号+空格分隔（HTML srcset 语法）", () => {
    const toUrl = (key: string) => `https://cdn.example/${key}`;
    expect(buildGridSrcset(SHA1, toUrl)).toBe(
      `https://cdn.example/display/${SHA1}-400w.webp 400w, ` +
        `https://cdn.example/display/${SHA1}-800w.webp 800w`,
    );
  });

  it("srcset 与 thumbKey 无关——纯 sha1 派生单一形态（同 displayKey 模式：键确定性，gridReady 标志只表存在性）", () => {
    expect(buildGridSrcset(SHA1, (k) => k)).toBe(
      GRID_WIDTHS.map((w) => `${gridKey(SHA1, w)} ${w}w`).join(", "),
    );
  });
});
