import { describe, expect, it } from "vitest";
import { formatGps, gpsLabel } from "./geo";

describe("formatGps", () => {
  it("北纬东经按 度°分′ 方向 输出", () => {
    expect(formatGps({ lat: 24 + 28 / 60, lon: 114 + 32 / 60 })).toBe("24°28′N 114°32′E");
  });

  it("南纬西经方向取 S / W", () => {
    expect(formatGps({ lat: -(33 + 52 / 60), lon: -(70 + 40 / 60) })).toBe("33°52′S 70°40′W");
  });

  it("赤道与本初子午线取 N / E", () => {
    expect(formatGps({ lat: 0, lon: 0 })).toBe("0°0′N 0°0′E");
  });
});

describe("gpsLabel", () => {
  it("有地名时优先显示地名", () => {
    expect(gpsLabel({ lat: 24.47, lon: 114.53, location: "示例省示例市" })).toBe("示例省示例市");
  });

  it("地名为空白时回退坐标", () => {
    expect(gpsLabel({ lat: 24 + 28 / 60, lon: 114 + 32 / 60, location: "   " })).toBe("24°28′N 114°32′E");
  });

  it("无地名字段时回退坐标", () => {
    expect(gpsLabel({ lat: 24 + 28 / 60, lon: 114 + 32 / 60 })).toBe("24°28′N 114°32′E");
  });
});
