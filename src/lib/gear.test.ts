import { describe, expect, it } from "vitest";
import { buildGearCameras, buildGearLenses, gearWhere, parseGearParam } from "./gear";

describe("parseGearParam", () => {
  it("trim 后返回，空串/纯空白/undefined 一律 undefined", () => {
    expect(parseGearParam("  Canon ")).toBe("Canon");
    expect(parseGearParam("   ")).toBeUndefined();
    expect(parseGearParam("")).toBeUndefined();
    expect(parseGearParam(undefined)).toBeUndefined();
  });

  it("超长参数截断到上限，防垃圾串进查询与 URL", () => {
    expect(parseGearParam("x".repeat(250))).toHaveLength(100);
  });
});

describe("buildGearCameras", () => {
  it("清洗 SQL NULL / JSON null / 空串，无展示名的行丢弃", () => {
    const rows = [
      { make: null, model: null, count: BigInt(5) },
      { make: "null", model: "", count: BigInt(3) },
      { make: "Canon", model: "Canon EOS R5", count: BigInt(12) },
    ];
    const out = buildGearCameras(rows);
    expect(out).toHaveLength(1);
    // formatCamera：model 以 make 为前缀时去重
    expect(out[0]).toEqual({ make: "Canon", model: "Canon EOS R5", label: "Canon EOS R5", count: 12 });
  });

  it("仅有 make 或仅有 model 的行也成立，bigint 转 number", () => {
    const out = buildGearCameras([
      { make: "Sony", model: null, count: BigInt(2) },
      { make: null, model: "X100VI", count: BigInt(7) },
    ]);
    expect(out).toEqual([
      { model: "X100VI", label: "X100VI", count: 7 },
      { make: "Sony", label: "Sony", count: 2 },
    ]);
  });

  it("count 降序，同 count 按展示名排序", () => {
    const out = buildGearCameras([
      { make: "Nikon", model: "Zf", count: BigInt(4) },
      { make: "Canon", model: "R5", count: BigInt(9) },
      { make: "Fujifilm", model: "X-T5", count: BigInt(4) },
    ]);
    expect(out.map((c) => c.label)).toEqual(["Canon R5", "Fujifilm X-T5", "Nikon Zf"]);
  });
});

describe("buildGearLenses", () => {
  it("丢弃空与 JSON null 行，count 降序、同数按名称", () => {
    const out = buildGearLenses([
      { lens: null, count: BigInt(3) },
      { lens: "null", count: BigInt(2) },
      { lens: "XF 23mm F1.4", count: BigInt(8) },
      { lens: "RF 35mm F1.8", count: BigInt(8) },
    ]);
    expect(out).toEqual([
      { lens: "RF 35mm F1.8", count: 8 },
      { lens: "XF 23mm F1.4", count: 8 },
    ]);
  });
});

describe("gearWhere", () => {
  it("空筛选产出空对象（spread 无副作用）", () => {
    expect(gearWhere({})).toEqual({});
    expect(gearWhere({ make: undefined, model: "", lens: undefined })).toEqual({});
  });

  it("单维度与相机组合维度都收敛进同一 AND 数组", () => {
    expect(gearWhere({ lens: "RF 35mm" })).toEqual({
      AND: [{ exif: { path: "$.lensModel", equals: "RF 35mm" } }],
    });
    expect(gearWhere({ make: "Canon", model: "EOS R5" })).toEqual({
      AND: [
        { exif: { path: "$.make", equals: "Canon" } },
        { exif: { path: "$.model", equals: "EOS R5" } },
      ],
    });
  });

  it("三维度齐下产出三条等值条件", () => {
    const w = gearWhere({ make: "Canon", model: "EOS R5", lens: "RF 35mm" });
    expect((w as { AND: unknown[] }).AND).toHaveLength(3);
  });
});
