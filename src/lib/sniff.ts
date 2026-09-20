export type ImageFormat = "JPEG" | "PNG" | "WEBP" | "HEIC" | "GIF" | "BMP" | "AVIF" | "UNKNOWN";

export interface SniffResult {
  format: ImageFormat;
  mimeType: string;
}

/** 按魔数判断图片格式 —— 桶内 objects/<sha1> 无扩展名，绝不依赖文件名。 */
export function sniffImage(buf: Buffer): SniffResult {
  const hex = (start: number, len: number) =>
    buf.subarray(start, start + len).toString("hex").toUpperCase();
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString("latin1");

  if (buf.length >= 3 && hex(0, 3) === "FFD8FF") return { format: "JPEG", mimeType: "image/jpeg" };
  if (buf.length >= 8 && hex(0, 8) === "89504E470D0A1A0A")
    return { format: "PNG", mimeType: "image/png" };
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    return { format: "WEBP", mimeType: "image/webp" };
  if (buf.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heimmif1)/i.test(brand) || /heic|heix|mif1|msf1/i.test(brand))
      return { format: "HEIC", mimeType: "image/heic" };
    if (/^avi[fs]/i.test(brand)) return { format: "AVIF", mimeType: "image/avif" };
  }
  if (buf.length >= 6 && (ascii(0, 3) === "GIF")) return { format: "GIF", mimeType: "image/gif" };
  if (buf.length >= 2 && hex(0, 2) === "424D") return { format: "BMP", mimeType: "image/bmp" };
  return { format: "UNKNOWN", mimeType: "application/octet-stream" };
}
