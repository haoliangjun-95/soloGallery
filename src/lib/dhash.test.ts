import { describe, expect, it } from "vitest";
import {
  DHASH_DEFAULT_THRESHOLD,
  DHASH_HEX_LENGTH,
  DHASH_THRESHOLD_PRESETS,
  groupSimilar,
  hammingDistance,
  isValidDhash,
  parseDhashThreshold,
  suggestKeeper,
  type SimilarEntry,
} from "./dhash";

const h = (n: number) => n.toString(16).padStart(DHASH_HEX_LENGTH, "0");

describe("isValidDhash", () => {
  it("接受小写十六进制定长", () => {
    expect(isValidDhash("0".repeat(16))).toBe(true);
    expect(isValidDhash("00ff00ff00ff00ff")).toBe(true);
  });
  it("拒绝长度不符/大写/非十六进制", () => {
    expect(isValidDhash("00ff00ff00ff00f")).toBe(false); // 15 位
    expect(isValidDhash("00ff00ff00ff00fff")).toBe(false); // 17 位
    expect(isValidDhash("00FF00FF00FF00FF")).toBe(false); // 大写
    expect(isValidDhash("00zz00zz00zz00zz")).toBe(false); // 非十六进制
  });
});

describe("hammingDistance", () => {
  it("相同哈希距离为 0", () => {
    expect(hammingDistance(h(0xabc), h(0xabc))).toBe(0);
  });
  it("单 bit 差异距离为 1，且对称", () => {
    expect(hammingDistance(h(0b1010), h(0b1011))).toBe(1);
    expect(hammingDistance(h(0b1011), h(0b1010))).toBe(1);
  });
  it("按位差异计数", () => {
    expect(hammingDistance(h(0b0000), h(0b1111))).toBe(4);
    expect(hammingDistance(h(0x00ff), h(0xff00))).toBe(16);
  });
});

describe("suggestKeeper", () => {
  const base = (over: Partial<SimilarEntry>): SimilarEntry => ({
    id: 1,
    dhash: h(0),
    favorite: false,
    width: null,
    height: null,
    fileSize: 0,
    ...over,
  });

  it("收藏优先于一切", () => {
    const keeper = suggestKeeper([
      base({ id: 1, favorite: false, width: 8000, height: 6000, fileSize: 999999 }),
      base({ id: 2, favorite: true, width: 100, height: 100, fileSize: 1 }),
    ]);
    expect(keeper.id).toBe(2);
  });
  it("同收藏下像素面积大者优先", () => {
    const keeper = suggestKeeper([
      base({ id: 1, width: 4000, height: 3000, fileSize: 999999 }),
      base({ id: 2, width: 1920, height: 1080, fileSize: 10000000 }),
    ]);
    expect(keeper.id).toBe(1);
  });
  it("缺尺寸按 0 参与比较，不 NaN", () => {
    const keeper = suggestKeeper([
      base({ id: 1, width: null, height: null, fileSize: 500 }),
      base({ id: 2, width: 100, height: 100, fileSize: 1 }),
    ]);
    expect(keeper.id).toBe(2);
  });
  it("像素并列时文件字节大者优先", () => {
    const keeper = suggestKeeper([
      base({ id: 1, width: 1000, height: 1000, fileSize: 100 }),
      base({ id: 2, width: 1000, height: 1000, fileSize: 200 }),
    ]);
    expect(keeper.id).toBe(2);
  });
  it("全并列时 id 小者（确定性兜底）", () => {
    const keeper = suggestKeeper([base({ id: 7 }), base({ id: 3 }), base({ id: 5 })]);
    expect(keeper.id).toBe(3);
  });
});

describe("groupSimilar", () => {
  const entry = (id: number, dhash: string, over: Partial<SimilarEntry> = {}): SimilarEntry => ({
    id,
    dhash,
    favorite: false,
    width: 1000,
    height: 1000,
    fileSize: 100,
    ...over,
  });

  it("距离 ≤ 阈值的聚为一簇，孤张不输出", () => {
    // h(0) 与 h(1) 差 1 bit；h(1<<40) 与 h(0) 差 1 bit；h(0xffffffffffffffff) 与 h(0) 差 64 bit
    const groups = groupSimilar([entry(1, h(0)), entry(2, h(1)), entry(3, h(0xffffffffffffffff))]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  it("传递闭合：A~B、B~C 而 A!~C 时三者同簇", () => {
    // 0000 ↔ 0011（2 bit）↔ 0001（1 bit）：两端 0000 vs 0001 差 1 bit……构造真正的链：
    // A=000000, B=000011（距 A 2）, C=000111（距 B 1, 距 A 3）→ 阈值 2 时 A!~C 但同簇
    const groups = groupSimilar(
      [entry(1, h(0b000000)), entry(2, h(0b000011)), entry(3, h(0b000111))],
      2,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
  });

  it("阈值默认值生效（DHASH_DEFAULT_THRESHOLD）", () => {
    const a = h(0);
    // 低 (阈值+1) 位全 1：与 a 恰差 7 bit > 默认阈值 6
    const bits = BigInt(DHASH_DEFAULT_THRESHOLD + 1);
    const b = ((BigInt(1) << bits) - BigInt(1)).toString(16).padStart(DHASH_HEX_LENGTH, "0");
    expect(groupSimilar([entry(1, a), entry(2, b)])).toHaveLength(0);
  });

  it("保留者排首位、其余按 id 升序，keeperId 一致", () => {
    const groups = groupSimilar([
      entry(5, h(0), { fileSize: 1 }),
      entry(2, h(1), { fileSize: 999 }), // 字节最大 → 保留者
      entry(9, h(2)),
      entry(4, h(3)),
    ]);
    expect(groups[0].keeperId).toBe(2);
    expect(groups[0].members.map((m) => m.id)).toEqual([2, 4, 5, 9]);
  });

  it("簇间按成员数降序、并列按 keeperId 升序", () => {
    const near = h(0);
    // 高位全 1 的独立簇基址：距 near 簇（0/1/2，低位）52+ bit，簇内相邻 ±1/±2
    const otherBase = "fffffffffffff000";
    const groups = groupSimilar([
      entry(10, near),
      entry(11, h(1)),
      entry(20, otherBase),
      entry(21, "fffffffffffff001"),
      entry(22, "fffffffffffff002"),
    ]);
    expect(groups.map((g) => g.members.length)).toEqual([3, 2]);
    expect(groups.map((g) => g.keeperId)).toEqual([20, 10]);
  });

  it("畸形哈希条目静默跳过，不拖垮分组", () => {
    const groups = groupSimilar([entry(1, h(0)), entry(2, "not-a-hash"), entry(3, h(1))]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id)).toEqual([1, 3]);
  });

  it("空输入返回空数组", () => {
    expect(groupSimilar([])).toEqual([]);
  });
});

describe("parseDhashThreshold", () => {
  it("白名单值原样返回（含字符串形式）", () => {
    expect(parseDhashThreshold("4")).toBe(4);
    expect(parseDhashThreshold("6")).toBe(6);
    expect(parseDhashThreshold("10")).toBe(10);
  });
  it("缺省/畸形/非白名单/重复参数回落默认档", () => {
    expect(parseDhashThreshold(undefined)).toBe(DHASH_DEFAULT_THRESHOLD);
    expect(parseDhashThreshold(null)).toBe(DHASH_DEFAULT_THRESHOLD);
    expect(parseDhashThreshold("8")).toBe(DHASH_DEFAULT_THRESHOLD);
    expect(parseDhashThreshold("abc")).toBe(DHASH_DEFAULT_THRESHOLD);
    expect(parseDhashThreshold(["10", "4"])).toBe(10);
  });
  it("默认档在白名单内（哨兵：档位表改动须同步默认值）", () => {
    expect((DHASH_THRESHOLD_PRESETS as readonly number[]).includes(DHASH_DEFAULT_THRESHOLD)).toBe(true);
  });
});
