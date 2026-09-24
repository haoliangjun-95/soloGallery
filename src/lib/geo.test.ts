import { describe, expect, it } from "vitest";
import { formatGps, gpsLabel, hideGps } from "./geo";

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

describe("hideGps", () => {
  const exif = {
    make: "Canon",
    model: "EOS R5",
    focalLength: 35,
    gps: { lat: 24.48, lon: 114.53, location: "广东省 深圳市" },
  };

  it("裁剪 gps 返回新对象，其余字段保留，原对象不被污染（不可变）", () => {
    const hidden = hideGps(exif);
    expect(hidden).not.toBe(exif);
    expect(hidden?.gps).toBeUndefined();
    expect(hidden).toMatchObject({ make: "Canon", model: "EOS R5", focalLength: 35 });
    expect(exif.gps.location).toBe("广东省 深圳市");
  });

  it("无 gps 时原引用返回（不做无谓拷贝），null 透传", () => {
    const plain = { make: "Canon" };
    expect(hideGps(plain)).toBe(plain);
    expect(hideGps(null)).toBeNull();
  });

  it("裁剪结果 JSON 序列化不含 gps 键（公开 API 响应面）", () => {
    expect(JSON.parse(JSON.stringify(hideGps(exif)))).toEqual({
      make: "Canon",
      model: "EOS R5",
      focalLength: 35,
    });
  });
});
