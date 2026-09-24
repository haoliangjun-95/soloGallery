/**
 * 地图坐标聚合纯函数（功能 1 地图视图）：按 zoom 相关的经纬度网格把照片点合并成簇，
 * MapView 在 Leaflet zoomend/moveend 时重算重绘。刻意不引 leaflet.markercluster——
 * 聚合逻辑留在 src/lib 纯函数层（vitest 可测），Leaflet 侧只做渲染。
 *
 * 网格法取舍：O(n) 单遍、确定性输出（Map 插入序=输入序），代价是恰跨网格边界的
 * 近邻点会被拆开（所有网格聚合的固有伪影）；照片库量级下视觉可接受，
 * 换层次聚类属过度设计（技术债清单有记录）。
 */

export interface MapPoint {
  lat: number;
  lon: number;
}

export interface MapCluster<T extends MapPoint> {
  /** 簇心：成员坐标算术平均（比首成员位置更贴近视觉重心） */
  lat: number;
  lon: number;
  /** 簇成员，保持输入顺序（新数组，与入参数组无引用共享） */
  points: T[];
}

/** 聚合网格边长（px）：同 zoom 下屏幕相距约 80px 内的点合并为一簇 */
export const CLUSTER_CELL_PX = 80;
/** Leaflet 瓦片边长（px）：墨卡托世界总宽 = 256 × 2^zoom px */
const TILE_PX = 256;

/**
 * 按 zoom 把点聚合成簇。cellDeg = 360° / (256·2^zoom) × cellPx——
 * zoom 越高网格越细（z16 ≈ 48m/格，z1 ≈ 56°/格）。
 * 入参不被触碰；成员为原对象引用（结构共享），簇与 points 数组均为新建。
 */
export function clusterPoints<T extends MapPoint>(
  points: readonly T[],
  zoom: number,
  cellPx: number = CLUSTER_CELL_PX,
): MapCluster<T>[] {
  const cellDeg = (360 * cellPx) / (TILE_PX * 2 ** zoom);
  const cells = new Map<string, T[]>();
  for (const pt of points) {
    const key = `${Math.floor((pt.lon + 180) / cellDeg)}:${Math.floor((pt.lat + 90) / cellDeg)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(pt);
    else cells.set(key, [pt]);
  }
  return [...cells.values()].map((members) => ({
    lat: members.reduce((sum, m) => sum + m.lat, 0) / members.length,
    lon: members.reduce((sum, m) => sum + m.lon, 0) / members.length,
    points: members,
  }));
}
