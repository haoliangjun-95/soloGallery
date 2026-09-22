import { describe, expect, it } from "vitest";
import { sniffImage } from "./sniff";

/** 按 magic number 造最小字节串，只需前若干字节即可判定 */
function bytes(...values: number[]): Buffer {
  return Buffer.from(values);
}

describe("sniffImage", () => {
  it("识别 JPEG", () => {
    const res = sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10));
    expect(res.format).toBe("JPEG");
    expect(res.mimeType).toBe("image/jpeg");
  });

  it("识别 PNG", () => {
    const res = sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    expect(res.format).toBe("PNG");
    expect(res.mimeType).toBe("image/png");
  });

  it("识别 WEBP（RIFF….WEBP）", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      bytes(0x00, 0x00, 0x00, 0x00),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(sniffImage(buf).format).toBe("WEBP");
  });

  it("识别 HEIC（ftyp + heic brand）", () => {
    const buf = Buffer.concat([
      bytes(0x00, 0x00, 0x00, 0x18),
      Buffer.from("ftypheic", "ascii"),
      Buffer.alloc(8),
    ]);
    const res = sniffImage(buf);
    expect(res.format).toBe("HEIC");
    expect(res.mimeType).toBe("image/heic");
  });

  it("识别 AVIF（ftyp + avif brand）", () => {
    const buf = Buffer.concat([
      bytes(0x00, 0x00, 0x00, 0x18),
      Buffer.from("ftypavif", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(sniffImage(buf).format).toBe("AVIF");
  });

  it("识别 GIF 与 BMP", () => {
    expect(sniffImage(Buffer.from("GIF89a", "ascii")).format).toBe("GIF");
    expect(sniffImage(bytes(0x42, 0x4d, 0x00, 0x00)).format).toBe("BMP");
  });

  it("未知内容归为 UNKNOWN + 通用二进制类型", () => {
    const res = sniffImage(bytes(0x01, 0x02, 0x03, 0x04));
    expect(res.format).toBe("UNKNOWN");
    expect(res.mimeType).toBe("application/octet-stream");
  });

  it("空 buffer 不抛异常", () => {
    expect(() => sniffImage(Buffer.alloc(0))).not.toThrow();
    expect(sniffImage(Buffer.alloc(0)).format).toBe("UNKNOWN");
  });
});
