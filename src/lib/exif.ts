import exifr from "exifr";

export interface GeoPoint {
  lat: number;
  lon: number;
  /** 反查地名缓存（如“广东省 深圳市 大鹏新区”），无则为空 */
  location?: string;
}

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
  gps?: GeoPoint;
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
    // GPS 必须走 exifr.gps()：pick GPSLatitude/GPSLongitude 拿到的是度分秒有理数数组
    // （如 [22,32,12.3]），不是十进制数，此前据此判空导致 GPS 从未提取成功。
    const [raw, gps] = await Promise.all([
      exifr.parse(buf, {
        pick: [...PICK],
        translateValues: false,
      }) as Promise<Record<string, unknown> | null>,
      exifr.gps(buf) as Promise<{ latitude: number; longitude: number } | undefined>,
    ]);
    if (!raw && !gps) return null;
    const r = raw ?? {};
    const exif: NormalizedExif = {
      shotAt: toISO(r.DateTimeOriginal),
      make: cleanString(r.Make),
      model: cleanString(r.Model),
      lensModel: cleanString(r.LensModel),
      iso: toNumber(r.ISO ?? r.ISOSpeedRatings),
      exposureTime: toNumber(r.ExposureTime),
      fNumber: toNumber(r.FNumber),
      focalLength: toNumber(r.FocalLength),
      focalLength35: toNumber(r.FocalLengthIn35mmFormat),
      orientation: toNumber(r.Orientation),
      ...(gps &&
      isFinite(gps.latitude) &&
      isFinite(gps.longitude) &&
      (gps.latitude !== 0 || gps.longitude !== 0)
        ? { gps: { lat: gps.latitude, lon: gps.longitude } }
        : {}),
    };
    const hasAny = Object.values(exif).some((v) => v !== undefined);
    return hasAny ? exif : null;
  } catch {
    return null;
  }
}
