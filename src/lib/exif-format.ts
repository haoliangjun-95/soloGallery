import type { NormalizedExif } from "./exif";

/** 纯格式化函数 —— 详情页 EXIF 卡对齐目标样例：
 *  2026 年 2 月 12 日 周四 GMT+8 15:55
 *  Canon EOS R6m2, ISO 100, 1/160
 *  RF24-105mm F4 L IS USM, 63mm, f/4
 *  JPEG, 4000 × 6000, 6.5 MB
 *  1C9A9846.jpg
 */

const TZ = "Asia/Shanghai";

export function formatShotDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")} 年 ${get("month")} 月 ${get("day")} 日 ${get("weekday")} GMT+8 ${get("hour")}:${get("minute")}`;
}

export function formatCamera(make?: string, model?: string): string | null {
  if (make && model) {
    const m = model.toLowerCase();
    const mk = make.toLowerCase();
    return m.startsWith(mk) ? model : `${make} ${model}`;
  }
  return model ?? make ?? null;
}

export function formatExposure(t: number | undefined): string | null {
  if (t === undefined) return null;
  if (t < 1) {
    const denom = Math.round(1 / t);
    return `1/${denom}`;
  }
  return `${Number(t.toFixed(1))}s`;
}

export function formatAperture(f: number | undefined): string | null {
  if (f === undefined) return null;
  const r = Math.round(f * 10) / 10;
  return Number.isInteger(r) ? `f/${r}` : `f/${r.toFixed(1)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  const n = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n} ${units[u]}`;
}

export function formatDimensions(w?: number, h?: number): string | null {
  if (!w || !h) return null;
  return `${w} × ${h}`;
}

export interface ExifCardInput {
  exif?: NormalizedExif | null;
  format: string;
  width?: number | null;
  height?: number | null;
  fileSize: number;
  fileName: string;
}

export interface ExifLine {
  label: string;
  value: string;
}

export function buildExifLines(input: ExifCardInput): ExifLine[] {
  const { exif } = input;
  const lines: ExifLine[] = [];

  const date = formatShotDate(exif?.shotAt);
  if (date) lines.push({ label: "拍摄", value: date });

  const camera = formatCamera(exif?.make, exif?.model);
  const exposureBits = [
    exif?.iso !== undefined ? `ISO ${exif.iso}` : null,
    formatExposure(exif?.exposureTime),
  ].filter(Boolean);
  const gearLine = [camera, ...exposureBits].filter(Boolean).join(", ");
  if (gearLine) lines.push({ label: "相机", value: gearLine });

  const lensBits = [
    exif?.lensModel,
    exif?.focalLength !== undefined ? `${Math.round(exif.focalLength)}mm` : null,
    formatAperture(exif?.fNumber),
  ].filter(Boolean);
  if (lensBits.length) lines.push({ label: "镜头", value: lensBits.join(", ") });

  const fileBits = [
    input.format,
    formatDimensions(input.width ?? undefined, input.height ?? undefined),
    formatFileSize(input.fileSize),
  ].filter(Boolean);
  if (fileBits.length) lines.push({ label: "文件", value: fileBits.join(", ") });

  if (input.fileName) lines.push({ label: "文件名", value: input.fileName });

  return lines;
}
