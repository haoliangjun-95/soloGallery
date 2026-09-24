import type { Metadata } from "next";
import MapView from "@/components/map/MapView";
import { listMapPoints } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "照片地图" };

/**
 * 瓦片源默认高德路网（免 key，GCJ-02 坐标系）。换天地图/OSM 时：
 * MAP_TILE_URL=<模板> + MAP_TILE_GCJ02=false（WGS-84 直接落图）+ 可选
 * MAP_TILE_SUBDOMAINS / MAP_TILE_ATTRIBUTION。env 只在服务端读取、以 props 下发，
 * 不用 NEXT_PUBLIC_*（避免把瓦片配置烧进客户端 bundle）。
 */
const DEFAULT_TILE_URL = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
const DEFAULT_TILE_SUBDOMAINS = "1,2,3,4";
const DEFAULT_TILE_ATTRIBUTION = "© 高德地图";
const MAX_ZOOM = 18;

export default async function MapPage() {
  const points = await listMapPoints();
  const tileUrl = process.env.MAP_TILE_URL ?? DEFAULT_TILE_URL;
  const tileSubdomains = (process.env.MAP_TILE_SUBDOMAINS ?? DEFAULT_TILE_SUBDOMAINS).split(",").filter(Boolean);
  const gcj02 = (process.env.MAP_TILE_GCJ02 ?? "true") !== "false";
  const attribution = process.env.MAP_TILE_ATTRIBUTION ?? DEFAULT_TILE_ATTRIBUTION;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">
        照片地图{" "}
        {points.length > 0 ? (
          <span className="text-sm text-muted font-normal">{points.length} 张含位置信息</span>
        ) : null}
      </h1>
      {points.length === 0 ? (
        /* 空态措辞不区分"无 GPS"与"exposeGps 关闭"——避免向访客泄露管理端隐私开关状态 */
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-edge bg-card py-24 text-center">
          <p className="text-base font-medium">暂无位置数据</p>
          <p className="text-sm text-muted">照片未包含 GPS 信息，或管理员已关闭位置公开展示。</p>
        </div>
      ) : (
        /* 高度 ≈ 100dvh 减去页头(h-16)+页边距(py-6)+标题行；min-h 兜底小屏 */
        <div className="h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-2xl border border-edge shadow-2xl shadow-black/40">
          <MapView
            points={points}
            tileUrl={tileUrl}
            tileSubdomains={tileSubdomains}
            gcj02={gcj02}
            maxZoom={MAX_ZOOM}
            attribution={attribution}
          />
        </div>
      )}
    </div>
  );
}
