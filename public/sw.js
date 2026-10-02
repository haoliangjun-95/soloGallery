/**
 * soloGallery Service Worker（PWA）——手写零依赖，避免 next-pwa 与
 * Next 16/Turbopack 的兼容性赌注。策略保守：
 * - /bucket/（MinIO 公共读图片）：cache-first，LRU 上限 400 张（缩略图重复访问零请求）
 * - /_next/static/（带内容 hash 的构建产物）：stale-while-revalidate
 * - 页面导航：network-first，离线回 /offline（HTML 不缓存，管理端/筛选永远拿新页）
 * - API 与所有非 GET：直连不经过 SW
 * 版本号变更即激活新旧缓存更替（activate 清理旧版本缓存）。
 */
const VERSION = "v1";
const IMG_CACHE = `sg-img-${VERSION}`;
const STATIC_CACHE = `sg-static-${VERSION}`;
const IMG_MAX_ENTRIES = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.add("/offline").catch(() => undefined); // 预热离线页（静态渲染）
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([IMG_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** cache-first + 容量裁剪（Map 迭代序即插入序，删最旧）。 */
async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    if (maxEntries) {
      const keys = await cache.keys();
      if (keys.length > maxEntries) await cache.delete(keys[0]);
    }
  }
  return res;
}

/** stale-while-revalidate：先回缓存，后台刷新。 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) void cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit ?? (await refresh) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/bucket/")) {
    event.respondWith(cacheFirst(request, IMG_CACHE, IMG_MAX_ENTRIES).catch(() => fetch(request)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE).catch(() => fetch(request)));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match("/offline")) ?? new Response("离线且无缓存页", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
  }
  // 其余（/api/、manifest、sitemap 等）直连
});
