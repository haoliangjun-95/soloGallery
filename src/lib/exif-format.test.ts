import { describe, expect, it } from "vitest";
import {
  buildExifLines,
  formatAperture,
  formatCamera,
  formatDimensions,
  formatExposure,
  formatFileSize,
  formatShotYear,
} from "./exif-format";

describe("formatFileSize", () => {
  it("小于 1KB 用字节", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("按 1024 进位并保留一位小数", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(6_815_744)).toBe("6.5 MB");
  });

  it("超过 100 的量级取整", () => {
    expect(formatFileSize(200 * 1024)).toBe("200 KB");
  });
});

describe("formatExposure", () => {
  it("短曝光写成分数", () => {
    expect(formatExposure(0.00625)).toBe("1/160");
  });

  it("长曝光带 s 后缀", () => {
    expect(formatExposure(2.5)).toBe("2.5s");
  });

  it("缺失返回 null", () => {
    expect(formatExposure(undefined)).toBeNull();
  });
});

describe("formatAperture", () => {
  it("整数光圈不带小数", () => {
    expect(formatAperture(4)).toBe("f/4");
  });

  it("非整数保留一位", () => {
    expect(formatAperture(1.78)).toBe("f/1.8");
  });
});

describe("formatCamera", () => {
  it("机型已含厂牌时不重复拼接", () => {
    expect(formatCamera("Canon", "Canon EOS R6m2")).toBe("Canon EOS R6m2");
  });

  it("机型不含厂牌时拼接", () => {
    expect(formatCamera("Sony", "ILCE-7M4")).toBe("Sony ILCE-7M4");
  });

  it("只有一项时返回该项", () => {
    expect(formatCamera(undefined, "X100V")).toBe("X100V");
    expect(formatCamera("Nikon", undefined)).toBe("Nikon");
    expect(formatCamera(undefined, undefined)).toBeNull();
  });
});

describe("formatDimensions", () => {
  it("宽高齐全时用全角乘号连接", () => {
    expect(formatDimensions(4000, 6000)).toBe("4000 × 6000");
  });

  it("缺任一项返回 null", () => {
    expect(formatDimensions(4000, undefined)).toBeNull();
  });
});

describe("formatShotYear", () => {
  it("按展示时区取年份（UTC 跨年时进位）", () => {
    expect(formatShotYear("2025-12-31T16:30:00Z")).toBe("2026");
  });

  it("非法输入返回 null", () => {
    expect(formatShotYear("not-a-date")).toBeNull();
    expect(formatShotYear(undefined)).toBeNull();
  });
});

describe("buildExifLines", () => {
  it("组装拍摄/相机/镜头/文件/文件名各行", () => {
    const lines = buildExifLines({
      exif: {
        shotAt: "2026-02-12T07:55:00.000Z",
        make: "Canon",
        model: "Canon EOS R6m2",
        iso: 100,
        exposureTime: 0.00625,
        lensModel: "RF24-105mm F4 L IS USM",
        focalLength: 63,
        fNumber: 4,
      },
      format: "JPEG",
      width: 4000,
      height: 6000,
      fileSize: 6_815_744,
      fileName: "示例.jpg",
    });
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l.value]));
    expect(byLabel["相机"]).toBe("Canon EOS R6m2, ISO 100, 1/160");
    expect(byLabel["镜头"]).toBe("RF24-105mm F4 L IS USM, 63mm, f/4");
    expect(byLabel["文件"]).toBe("JPEG, 4000 × 6000, 6.5 MB");
    expect(byLabel["文件名"]).toBe("示例.jpg");
    expect(byLabel["拍摄"]).toContain("2026");
  });

  it("无 EXIF 时只输出文件相关行", () => {
    const lines = buildExifLines({
      exif: null,
      format: "PNG",
      width: null,
      height: null,
      fileSize: 500,
      fileName: "无exif.png",
    });
    const labels = lines.map((l) => l.label);
    expect(labels).not.toContain("相机");
    expect(labels).not.toContain("拍摄");
    expect(labels).toContain("文件");
    expect(labels).toContain("文件名");
  });
});
