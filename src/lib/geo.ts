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
 * Photon(komoot, OSM 数据) 反查地名，限速 1 req/s。
 * 曾用 Nominatim，但国内服务器到 nominatim.openstreetmap.org 不可达（反查全部失败）。
 * 失败/无结果返回 undefined，展示回退坐标格式。结果由调用方缓存在 exif.gps.location，不重复请求。
 */
let lastRequestAt = 0;

export async function reverseGeocode(gps: GeoPoint, signal?: AbortSignal): Promise<string | undefined> {
  if (process.env.GEOCODING_DISABLED === "true") return undefined;
  const now = Date.now();
  const wait = Math.max(0, 1050 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  try {
    const url = `https://photon.komoot.io/reverse?lat=${gps.lat}&lon=${gps.lon}&limit=1`;
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(8000),
      headers: { "User-Agent": "soloGallery/1.0 (personal photo gallery)" },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      features?: Array<{ properties?: Record<string, string> }>;
    };
    const p = data.features?.[0]?.properties ?? {};
    // 目标格式「深圳 / 福田」：市 / 区县两级、斜杠分隔，缺失逐级回退
    const district = p.district || p.county || p.suburb || p.locality || p.town;
    const city = (p.city || p.state || p.country || "").replace(/市$/, "");
    const parts = [city, district].filter((s): s is string => Boolean(s && s.trim()));
    if (parts.length === 2 && parts[0] === parts[1]) parts.pop();
    const label = parts.join(" / ");
    return label.trim() ? label : undefined;
  } catch {
    return undefined;
  }
}
