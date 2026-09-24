import { describe, expect, it } from "vitest";
import { outOfChina, wgs84ToGcj02 } from "./geo-transform";

describe("outOfChina", () => {
  it("境内坐标（深圳/北京）为 false", () => {
    expect(outOfChina(22.5431, 114.0579)).toBe(false);
    expect(outOfChina(39.9042, 116.4074)).toBe(false);
  });

  it("境外坐标（巴黎/东京）为 true——经度窗 72.004~137.8347、纬度窗 0.8293~55.8271", () => {
    expect(outOfChina(48.8566, 2.3522)).toBe(true);
    expect(outOfChina(35.6895, 139.6917)).toBe(true);
  });
});

describe("wgs84ToGcj02", () => {
  // 期望值为公开发表算法（eviltransform）的独立 python 实现产出，非本模块自证
  it("深圳：偏移与独立参考实现一致（几百米量级）", () => {
    const g = wgs84ToGcj02(22.5431, 114.0579);
    expect(g.lat).toBeCloseTo(22.540382814, 7);
    expect(g.lon).toBeCloseTo(114.063013999, 7);
  });

  it("北京：偏移与独立参考实现一致", () => {
    const g = wgs84ToGcj02(39.9042, 116.4074);
    expect(g.lat).toBeCloseTo(39.905603343, 7);
    expect(g.lon).toBeCloseTo(116.413642254, 7);
  });

  it("乌鲁木齐（西陲）与拉萨（高原）同样吻合——算法全境一致非分区拟合", () => {
    const wlmq = wgs84ToGcj02(43.8256, 87.6168);
    expect(wlmq.lat).toBeCloseTo(43.826805393, 7);
    expect(wlmq.lon).toBeCloseTo(87.619649949, 7);
    const lhasa = wgs84ToGcj02(29.65, 91.14);
    expect(lhasa.lat).toBeCloseTo(29.647266378, 7);
    expect(lhasa.lon).toBeCloseTo(91.14153095, 7);
  });

  it("境外原样返回（不做偏移，海外瓦片源 WGS-84 直接可画）", () => {
    expect(wgs84ToGcj02(48.8566, 2.3522)).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(wgs84ToGcj02(35.6895, 139.6917)).toEqual({ lat: 35.6895, lon: 139.6917 });
  });

  it("境内偏移幅度 < 0.01°（发表算法的量级约束，防实现走样）", () => {
    for (const [lat, lon] of [
      [22.5431, 114.0579],
      [39.9042, 116.4074],
      [31.2304, 121.4737],
      [43.8256, 87.6168],
      [29.65, 91.14],
    ] as const) {
      const g = wgs84ToGcj02(lat, lon);
      expect(Math.abs(g.lat - lat)).toBeLessThan(0.01);
      expect(Math.abs(g.lon - lon)).toBeLessThan(0.01);
      // 境内必产生偏移（非恒等）
      expect(g.lat !== lat || g.lon !== lon).toBe(true);
    }
  });

  it("返回新对象（数字入参天然无共享，锁定返回形状 {lat, lon}）", () => {
    expect(wgs84ToGcj02(22.5431, 114.0579)).toStrictEqual({
      lat: expect.any(Number),
      lon: expect.any(Number),
    });
  });
});
