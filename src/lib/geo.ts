import type { GeoPoint, NormalizedExif } from "./exif";
import { createLogger } from "./logger";

const logger = createLogger("geo");

/** Photon 最小请求间隔（ms）：对外承诺 1 req/s，留 50ms 余量 */
const MIN_REQUEST_INTERVAL_MS = 1050;
/** 反查请求超时（ms） */
const REQUEST_TIMEOUT_MS = 8000;

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
 * 隐私裁剪（exposeGps 关闭时公开 DTO 用）：返回剔除 gps 的 exif 副本；
 * 无 gps 原引用返回，避免整批列表的无谓拷贝。管理端路径不经此函数。
 * gps: undefined 在 JSON 序列化时整个键被丢弃——API 响应面同样不含坐标。
 */
export function hideGps(exif: NormalizedExif | null): NormalizedExif | null {
  if (!exif?.gps) return exif;
  return { ...exif, gps: undefined };
}

/**
 * Photon(komoot, OSM 数据) 反查地名，限速 1 req/s。
 * 曾用 Nominatim，但国内服务器到 nominatim.openstreetmap.org 不可达（反查全部失败）。
 * 失败/无结果返回 undefined，展示回退坐标格式。结果由调用方缓存在 exif.gps.location，不重复请求。
 */
let lastRequestAt = 0;

export async function reverseGeocode(gps: GeoPoint, signal?: AbortSignal): Promise<string | undefined> {
  if (process.env.GEOCODING_DISABLED === "true") return undefined;
  // 预约槽位：先同步占用下一个可用时间点再睡。旧的「读→睡→写」在并发下失效——
  // sync 以 3~16 并发跑时，多个 worker 基于同一陈旧值等待、睡醒后同时发请求，
  // 实际 burst 违反 1 req/s（Photon 有封 IP 先例，Nominatim 已踩过一次坑）。
  const now = Date.now();
  const slot = Math.max(lastRequestAt + MIN_REQUEST_INTERVAL_MS, now);
  lastRequestAt = slot;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));

  try {
    const url = `https://photon.komoot.io/reverse?lat=${gps.lat}&lon=${gps.lon}&limit=1`;
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "soloGallery/1.0 (personal photo gallery)" },
    });
    // 失败不静默：GPS 反查全批失败曾等到数据入库后才发现（见 c8d33cd 事故）
    if (!res.ok) {
      logger.warn("Photon 反查失败", `status=${res.status} lat=${gps.lat} lon=${gps.lon}`);
      return undefined;
    }
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
  } catch (err) {
    // 网络异常/超时不静默：展示层回退坐标格式，但运维需要能看到失败原因
    logger.warn("Photon 反查异常", err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
