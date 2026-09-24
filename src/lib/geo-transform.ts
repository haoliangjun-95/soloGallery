/**
 * WGS-84 → GCJ-02 坐标偏移（功能 1 地图视图）。
 * GCJ-02（"火星坐标"）是国测局规定的国内公开地图坐标系：高德/腾讯瓦片底图按
 * GCJ-02 渲染，EXIF 的 WGS-84 坐标直接落点会偏几百米（地图视图选型调研的核心风险）；
 * 天地图（CGCS2000≈WGS-84）与海外底图（OSM 等）无偏移，配 MAP_TILE_GCJ02=false 跳过转换。
 * 算法为 eviltransform 公开标准实现，与独立 python 实现逐点对拍（geo-transform.test.ts 参考向量）。
 */

/** 克拉索夫斯基 1940 椭球长半轴（m）——GCJ-02 偏移算法规定的椭球参数 */
const ELLIPSOID_A = 6378245.0;
/** 克拉索夫斯基椭球第一偏心率平方 */
const ELLIPSOID_EE = 0.00669342162296594323;
const PI = Math.PI;

/**
 * 境外粗判：国境范围外不做加密偏移（原样返回）。
 * 经纬度矩形窗口覆盖本土及周边，无需精确国界——境外点即便误判为境内，
 * 偏移公式在窗口边缘也连续收敛，不会产生跳变。
 */
export function outOfChina(lat: number, lon: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

/** 纬度偏移扰动多项式（发表算法原文，系数勿改——测试向量即哨兵） */
function transformLat(x: number, y: number): number {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  r += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return r;
}

/** 经度偏移扰动多项式（发表算法原文，系数勿改） */
function transformLon(x: number, y: number): number {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  r += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return r;
}

/**
 * WGS-84 → GCJ-02。境外坐标原样返回；数字入参、返回新对象，无共享状态。
 * 单向转换即可（落点绘制只需要 WGS→GCJ；反向 GCJ→WGS 无精确闭式解，勿加）。
 */
export function wgs84ToGcj02(lat: number, lon: number): { lat: number; lon: number } {
  if (outOfChina(lat, lon)) return { lat, lon };
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ELLIPSOID_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((ELLIPSOID_A * (1 - ELLIPSOID_EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((ELLIPSOID_A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat + dLat, lon: lon + dLon };
}
