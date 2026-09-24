import { describe, expect, it } from "vitest";
import { ARCHIVE_PER_MONTH, buildArchiveYear, type ArchiveSourcePhoto } from "./archive";

const row = (monthKey: string, sha1: string, favorite = false): ArchiveSourcePhoto => ({
  sha1,
  title: `t-${sha1}`,
  thumbUrl: `https://cdn.example/${sha1}.webp`,
  favorite,
  monthKey,
});

describe("buildArchiveYear", () => {
  it("空输入返回空数组（无照片的年份不生成 12 个空月份占位）", () => {
    expect(buildArchiveYear([], 2024)).toEqual([]);
  });

  it("按月分组、时间升序输出（1 月→12 月，年度长页像翻相册），无照片的月份不出现", () => {
    const out = buildArchiveYear([row("2024-06", "b"), row("2024-01", "a")], 2024);
    expect(out.map((m) => m.ym)).toEqual(["2024-01", "2024-06"]);
    expect(out[0]).toMatchObject({ ym: "2024-01", year: 2024, month: 1, total: 1 });
    expect(out[1]).toMatchObject({ ym: "2024-06", year: 2024, month: 6, total: 1 });
  });

  it("收藏优先：同月内 favorite 排前，类内保持输入序（shotAt 倒序）——稳定排序语义", () => {
    const out = buildArchiveYear(
      [row("2024-03", "n1"), row("2024-03", "f1", true), row("2024-03", "n2"), row("2024-03", "f2", true)],
      2024,
      4,
    );
    expect(out[0].photos.map((p) => p.sha1)).toEqual(["f1", "f2", "n1", "n2"]);
  });

  it("收藏优先于截断：favorite 即使输入序在 perMonth 之外也入选（评审 M-1——先截断后排序的回归变体能通过其余全部测试，唯此用例能钉住「排序先于 slice」的实现顺序）", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row("2024-05", `n${i}`)),
      row("2024-05", "f1", true), // 最旧 → shotAt 倒序输入下排最后，落在缺省 perMonth=8 截断线之外
    ];
    const out = buildArchiveYear(rows, 2024);
    expect(out[0].photos.map((p) => p.sha1)).toEqual(["f1", "n0", "n1", "n2", "n3", "n4", "n5", "n6"]);
    expect(out[0].total).toBe(9);
  });

  it("perMonth 截断：photos 只留前 perMonth 张，total 仍报该月全量（UI「共 X 张 · 精选 N」）", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row("2024-05", `p${i}`));
    const out = buildArchiveYear(rows, 2024, 2);
    expect(out[0].photos.map((p) => p.sha1)).toEqual(["p0", "p1"]);
    expect(out[0].total).toBe(5);
  });

  it("缺省 perMonth 为 ARCHIVE_PER_MONTH（8 = 4 列 × 2 行）", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row("2024-05", `p${i}`));
    const out = buildArchiveYear(rows, 2024);
    expect(out[0].photos).toHaveLength(ARCHIVE_PER_MONTH);
    expect(ARCHIVE_PER_MONTH).toBe(8);
  });

  it("非目标年份的行被排除（跨年边界的行不混入本年归档）", () => {
    const out = buildArchiveYear([row("2023-12", "old"), row("2024-01", "new"), row("2025-01", "future")], 2024);
    expect(out).toHaveLength(1);
    expect(out[0].ym).toBe("2024-01");
    expect(out[0].photos.map((p) => p.sha1)).toEqual(["new"]);
  });

  it("不可变：入参数组与行对象不被触碰；photos 是新对象且不含 monthKey（DTO 边界剥离内部字段）", () => {
    const rows = [row("2024-02", "a", true), row("2024-02", "b")];
    const snapshot = JSON.parse(JSON.stringify(rows));
    const out = buildArchiveYear(rows, 2024);
    expect(rows).toEqual(snapshot);
    expect(out[0].photos[0]).toStrictEqual({
      sha1: "a",
      title: "t-a",
      thumbUrl: "https://cdn.example/a.webp",
      favorite: true,
    });
  });
});
