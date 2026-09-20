import type { GeoPoint } from "./exif";

/** 坐标 → 度分格式：24°28′N 114°32′E */
export function formatGps(gps: GeoPoint): string {
  const fmt = (v: number, pos: string, neg: string) => {
    const dir = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    const deg = Math.floor(abs);
    const min = Math.round((abs - deg) * 60);
    return `${deg}°${min}′${dir}`;
  };
  return `${fmt(gps.lat, "N", "S")} ${fmt(gps.lon, "E", "W")}`;
}

/** 展示用：优先地名，无则坐标。 */
export function gpsLabel(gps: GeoPoint): string {
  return gps.location?.trim() || formatGps(gps);
}

/**
 * Nominatim(OSM) 反查地名，限速 1 req/s。失败/无结果返回 undefined，
 * 展示回退坐标格式。结果由调用方缓存在 exif.gps.location，不重复请求。
 */
let lastRequestAt = 0;

export async function reverseGeocode(gps: GeoPoint, signal?: AbortSignal): Promise<string | undefined> {
  if (process.env.GEOCODING_DISABLED === "true") return undefined;
  const now = Date.now();
  const wait = Math.max(0, 1050 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=zh-CN&lat=${gps.lat}&lon=${gps.lon}`;
    const res = await fetch(url, {
      signal,
      headers: { "User-Agent": "soloGallery/1.0 (personal photo gallery)" },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    // 从具体到宽泛取有意义的中文段落
    const parts = [
      a.city || a.town || a.village || a.municipality || a.suburb,
      a.state || a.province || a.county,
      a.country,
    ].filter((s): s is string => Boolean(s && s.trim()));
    const label = parts.join(" ");
    return label.trim() ? label : undefined;
  } catch {
    return undefined;
  }
}
