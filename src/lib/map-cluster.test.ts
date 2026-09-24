import { describe, expect, it } from "vitest";
import { clusterPoints } from "./map-cluster";

type P = { lat: number; lon: number; sha1: string };
const p = (lat: number, lon: number, sha1: string): P => ({ lat, lon, sha1 });

describe("clusterPoints", () => {
  it("空输入返回空数组", () => {
    expect(clusterPoints([], 10)).toEqual([]);
  });

  it("同一网格单元内的相近点合并为一簇，簇心为成员均值，成员保持输入顺序", () => {
    // zoom 10 → 单元 ≈ 0.11°（约 12km），相距 0.01° 的两点必同格
    const pts = [p(22.55, 114.55, "a"), p(22.56, 114.56, "b")];
    const clusters = clusterPoints(pts, 10);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].points.map((x) => x.sha1)).toEqual(["a", "b"]);
    expect(clusters[0].lat).toBeCloseTo(22.555, 10);
    expect(clusters[0].lon).toBeCloseTo(114.555, 10);
  });

  it("高 zoom 下相距较远的点不合并", () => {
    const clusters = clusterPoints([p(22.55, 114.55, "sz"), p(39.9, 116.4, "bj")], 10);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].points).toHaveLength(1);
    expect(clusters[1].points).toHaveLength(1);
  });

  it("低 zoom 下全国范围的点合并为一簇（网格步长随 zoom 收缩）", () => {
    // zoom 1 → 单元 = 56.25°，深圳与北京同格
    const clusters = clusterPoints([p(22.55, 114.55, "sz"), p(39.9, 116.4, "bj")], 1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].points.map((x) => x.sha1)).toEqual(["sz", "bj"]);
  });

  it("泛型透传：额外字段（sha1 等业务负载）原样保留", () => {
    const [c] = clusterPoints([p(22.55, 114.55, "keep-me")], 10);
    expect(c.points[0]).toEqual({ lat: 22.55, lon: 114.55, sha1: "keep-me" });
  });

  it("不可变：输入数组与输入对象都不被触碰，簇的 points 是新数组", () => {
    const pts = [p(22.55, 114.55, "a"), p(22.56, 114.56, "b")];
    const snapshot = JSON.parse(JSON.stringify(pts));
    const clusters = clusterPoints(pts, 10);
    expect(pts).toEqual(snapshot);
    expect(clusters[0].points).not.toBe(pts);
  });

  it("确定性：同输入两次调用产出相同簇序（渲染 diff 稳定）", () => {
    const pts = [p(22.55, 114.55, "a"), p(39.9, 116.4, "b"), p(22.56, 114.56, "c")];
    expect(clusterPoints(pts, 10)).toEqual(clusterPoints(pts, 10));
  });
});
