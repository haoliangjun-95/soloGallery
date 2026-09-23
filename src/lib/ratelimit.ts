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
  // X-Forwarded-For / X-Real-IP 都是客户端可任意伪造的头：无反代时直接采信，
  // 攻击者每次请求换一个假 IP 即可绕过登录爆破限制与评论限流。
  // 仅在部署方明确声明拓扑（TRUST_PROXY=true）时信任转发头，且要求反代
  // 覆写而非追加 XFF（如 nginx：proxy_set_header X-Forwarded-For $remote_addr）。
  // 直连场景 Route Handler 拿不到 socket IP，统一 "unknown"——限流退化为全局桶，
  // 对单管理员站点仍可拦截爆破，只是粒度变粗。
  if (process.env.TRUST_PROXY !== "true") return "unknown";
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
