import exifr from "exifr";

/** 归一化后的 EXIF（入库 exif 字段的形状）。 */
export interface NormalizedExif {
  shotAt?: string; // ISO 8601
  make?: string;
  model?: string;
  lensModel?: string;
  iso?: number;
  exposureTime?: number; // 秒
  fNumber?: number;
  focalLength?: number; // mm
  focalLength35?: number;
  orientation?: number;
}

const PICK = [
  "DateTimeOriginal",
  "Make",
  "Model",
  "LensModel",
  "ISO",
  "ISOSpeedRatings",
  "ExposureTime",
  "FNumber",
  "FocalLength",
  "FocalLengthIn35mmFormat",
  "Orientation",
] as const;

function toISO(v: unknown): string | undefined {
  if (v instanceof Date) return !isNaN(v.getTime()) ? v.toISOString() : undefined;
  if (typeof v === "string") {
    const d = new Date(v);
    return !isNaN(d.getTime()) ? d.toISOString() : undefined;
  }
  return undefined;
}

function cleanString(v: unknown): string | undefined {
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : undefined;
  }
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  return undefined;
}

export async function extractExif(buf: Buffer): Promise<NormalizedExif | null> {
  try {
    const raw = (await exifr.parse(buf, {
      pick: [...PICK],
      translateValues: false,
    })) as Record<string, unknown> | null;
    if (!raw) return null;
    const exif: NormalizedExif = {
      shotAt: toISO(raw.DateTimeOriginal),
      make: cleanString(raw.Make),
      model: cleanString(raw.Model),
      lensModel: cleanString(raw.LensModel),
      iso: toNumber(raw.ISO ?? raw.ISOSpeedRatings),
      exposureTime: toNumber(raw.ExposureTime),
      fNumber: toNumber(raw.FNumber),
      focalLength: toNumber(raw.FocalLength),
      focalLength35: toNumber(raw.FocalLengthIn35mmFormat),
      orientation: toNumber(raw.Orientation),
    };
    const hasAny = Object.values(exif).some((v) => v !== undefined);
    return hasAny ? exif : null;
  } catch {
    return null;
  }
}
