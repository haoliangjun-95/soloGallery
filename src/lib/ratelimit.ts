/** 评论提交的内存滑动窗口限流（单实例足够，solo 项目）。 */
const buckets = new Map<string, number[]>();

export function rateAllow(ip: string, limit = 5, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const list = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    buckets.set(ip, list);
    return false;
  }
  list.push(now);
  buckets.set(ip, list);
  if (buckets.size > 10000) {
    // 防泄漏：清理全量过期
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
