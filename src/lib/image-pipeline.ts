import sharp from "sharp";
import { sniffImage } from "./sniff";
import { DISPLAY_QUALITY, DISPLAY_WIDTH, GRID_QUALITY, GRID_WIDTHS } from "./bucket-layout";

export interface DisplayResult {
  webp: Buffer;
  width: number; // 原始尺寸（按 EXIF 方向校正后）
  height: number;
  displayWidth: number;
  displayHeight: number;
}

/** sharp 预编译二进制无法解码 HEVC 编码的 HEIC，走独立解码器，失败则抛错由调用方降级。 */
async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const mod = (await import("heic-convert")) as unknown as {
    default: (opts: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<Buffer>;
  };
  const convert = mod.default ?? (mod as never as typeof mod.default);
  return convert({ buffer: buf, format: "JPEG", quality: 0.92 });
}

/** 确保 sharp 能解码当前字节：HEIC 先转 JPEG，其余原样。 */
async function decodable(buf: Buffer): Promise<Buffer> {
  const { format } = sniffImage(buf);
  if (format === "HEIC") {
    try {
      return await heicToJpeg(buf);
    } catch (err) {
      throw new Error(
        `HEIC 解码失败（heic-convert 不可用？）: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return buf;
}

async function originalSize(input: Buffer): Promise<{ width?: number; height?: number; orientation?: number }> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  let w = meta.width;
  let h = meta.height;
  const o = meta.orientation;
  if (o && o >= 5 && o <= 8 && w && h) [w, h] = [h, w];
  return { width: w, height: h, orientation: o };
}

/** 生成 display WebP（1920w，不放大），并返回原始/显示两级尺寸。 */
export async function generateDisplay(buf: Buffer): Promise<DisplayResult> {
  const input = await decodable(buf);
  const size = await originalSize(input);
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate() // 按 EXIF 方向自动转正
    .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
    .webp({ quality: DISPLAY_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return {
    webp: data,
    width: size.width ?? info.width,
    height: size.height ?? info.height,
    displayWidth: info.width,
    displayHeight: info.height,
  };
}

export interface GridVariant {
  width: number; // 档位标称宽（srcset 描述符用它；小图不放大时实际宽可能更小）
  webp: Buffer;
}

/**
 * 网格宽度档变体（功能 10）：从 display WebP 派生而非原图——display 已 EXIF
 * 转正、已解码（HEIC 转换只在 generateDisplay 发生一次），缩小尺寸开销极低；
 * 1920w q82 → ≤800w q78 的二次有损在网格展示尺寸下视觉不可辨。
 * withoutEnlargement：display 宽不足档位时该档按实际宽输出（描述符仍标称，
 * 浏览器按描述符选档，超小图轻微放大属可接受边界）。
 * 任一档失败整体抛错——调用方 best-effort 处理：gridReady=false 退回 src，
 * 绝不输出半套 srcset（浏览器选定候选后失败不回落 src，半套 = 概率碎图）。
 */
export async function generateGridVariants(displayWebp: Buffer): Promise<GridVariant[]> {
  return Promise.all(
    GRID_WIDTHS.map(async (width) => ({
      width,
      webp: await sharp(displayWebp, { failOn: "none" })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: GRID_QUALITY })
        .toBuffer(),
    })),
  );
}
