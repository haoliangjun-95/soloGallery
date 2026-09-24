"use client";

/**
 * 地图视图客户端组件（功能 1）：Leaflet 底图 + 网格聚合标记。
 * - Leaflet JS 在 useEffect 内动态 import（Next 官方 lazy-loading 模式，
 *   node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md：外部库挂载后
 *   按需加载，不进 SSR bundle；CSS 顶层静态引入——App Router 允许任意组件引入全局 CSS）
 * - 坐标服务端按 WGS-84 出库（listMapPoints）；GCJ-02 瓦片（高德）逐点偏移后落图，
 *   WGS-84 瓦片（天地图/OSM）直接落图
 * - zoomend 重算聚合（map-cluster.ts 纯函数，Leaflet 侧只做渲染）
 * - 弹窗内容全部 DOM API 构建、文本一律 textContent（title/地名是用户数据，永不 innerHTML）
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { wgs84ToGcj02 } from "@/lib/geo-transform";
import { clusterPoints, type MapCluster } from "@/lib/map-cluster";
import type { MapPointDTO } from "@/lib/queries";

type LeafletNS = typeof import("leaflet");

interface Props {
  points: MapPointDTO[];
  /** 瓦片 URL 模板（{s}/{x}/{y}/{z} 占位符） */
  tileUrl: string;
  /** Leaflet subdomains 列表（高德 "1,2,3,4" → webrd01~04 负载均衡） */
  tileSubdomains: string[];
  /** 瓦片坐标系是否 GCJ-02（高德/腾讯）；false 时 WGS-84 直接落图 */
  gcj02: boolean;
  maxZoom: number;
  attribution: string;
}

/** 单簇弹窗缩略图上限，超出以 "+N" 收尾（4 列 × 3 行） */
const MAX_POPUP_THUMBS = 12;

export default function MapView({ points, tileUrl, tileSubdomains, gcj02, maxZoom, attribution }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    let disposed = false;
    let map: import("leaflet").Map | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      // 动态 import 期间组件可能已卸载（StrictMode 双挂载 / 快速导航）
      if (disposed || !container.isConnected) return;

      // GCJ-02 瓦片需要坐标偏移（几百米量级）；map 出新对象，不触碰入参
      const projected = gcj02 ? points.map((p) => ({ ...p, ...wgs84ToGcj02(p.lat, p.lon) })) : points;

      const m = L.map(container);
      map = m; // 交给 cleanup 销毁
      L.tileLayer(tileUrl, { subdomains: tileSubdomains, maxZoom, attribution }).addTo(m);
      const clusterLayer = L.layerGroup().addTo(m);

      const draw = () => {
        clusterLayer.clearLayers();
        for (const cluster of clusterPoints(projected, m.getZoom())) {
          L.marker([cluster.lat, cluster.lon], { icon: countIcon(L, cluster.points.length) })
            .bindPopup(() => buildPopup(cluster), { maxWidth: 264 })
            .addTo(clusterLayer);
        }
      };

      m.on("zoomend", draw);
      m.fitBounds(
        L.latLngBounds(projected.map((p) => [p.lat, p.lon] as [number, number])),
        // 单点/小范围时 fitBounds 会顶到 maxZoom，15 级封顶留街区上下文
        { maxZoom: 15, padding: [40, 40] },
      );
      draw();
    })();

    return () => {
      disposed = true;
      map?.remove(); // 解绑事件 + 释放瓦片/图层
      map = undefined;
    };
  }, [points, tileUrl, tileSubdomains, gcj02, maxZoom, attribution]);

  return <div ref={containerRef} className="h-full w-full bg-card" role="application" aria-label="照片地图" />;
}

/** 标记气泡：数字即簇大小。html 只插值数字（length/size），无注入面 */
function countIcon(L: LeafletNS, n: number) {
  const size = n === 1 ? 30 : n < 10 ? 36 : n < 50 ? 42 : 48;
  const font = n > 999 ? 10 : n > 99 ? 11 : 13;
  return L.divIcon({
    className: "", // 去掉 leaflet-default-div-icon 的白底方块
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:rgba(18,18,20,0.88);border:1.5px solid rgba(245,180,60,0.55);color:#fff;font:600 ${font}px/1 -apple-system,'PingFang SC',sans-serif;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,0.45)">${n}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 弹窗：地名 + N 张 + 缩略图网格（每张链接到详情页）。文本一律 textContent */
function buildPopup(cluster: MapCluster<MapPointDTO>): HTMLElement {
  const members = cluster.points;
  const box = document.createElement("div");

  const head = document.createElement("p");
  head.className = "mb-2 text-xs font-semibold text-neutral-700";
  head.textContent = `${members[0].location ?? "照片地点"} · ${members.length} 张`;
  box.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-4 gap-1.5";
  for (const p of members.slice(0, MAX_POPUP_THUMBS)) {
    const link = document.createElement("a");
    link.href = `/photo/${encodeURIComponent(p.sha1)}`;
    const img = document.createElement("img");
    img.src = p.thumbUrl;
    img.alt = p.title || "未命名";
    img.width = 54;
    img.height = 54;
    img.loading = "lazy";
    img.className = "h-[54px] w-[54px] rounded-md object-cover transition-opacity hover:opacity-75";
    link.appendChild(img);
    grid.appendChild(link);
  }
  if (members.length > MAX_POPUP_THUMBS) {
    const more = document.createElement("span");
    more.className = "flex h-[54px] w-[54px] items-center justify-center rounded-md bg-neutral-200 text-xs font-medium text-neutral-600";
    more.textContent = `+${members.length - MAX_POPUP_THUMBS}`;
    grid.appendChild(more);
  }
  box.appendChild(grid);
  return box;
}
