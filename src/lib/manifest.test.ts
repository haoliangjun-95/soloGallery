import { describe, expect, it } from "vitest";
import { isValidSha1, mergeManifests, parseManifest, type ManifestSnapshot } from "./manifest";

/** 合成 sha1：40 位十六进制 */
function sha1(seed: string): string {
  return seed.repeat(40).slice(0, 40);
}

const HASH_A = sha1("a");
const HASH_B = sha1("b");

function snapshot(partial: Partial<ManifestSnapshot> & { deviceId: string }): ManifestSnapshot {
  return {
    ts: 1,
    images: [],
    categories: [],
    tombstones: [],
    ...partial,
  };
}

describe("isValidSha1", () => {
  it("接受 40 位小写十六进制", () => {
    expect(isValidSha1(HASH_A)).toBe(true);
  });

  it("大小写与空白经归一化后仍接受", () => {
    expect(isValidSha1(` ${HASH_A.toUpperCase()} `)).toBe(true);
  });

  it("长度不足或非十六进制拒绝", () => {
    expect(isValidSha1("abc")).toBe(false);
    expect(isValidSha1("z".repeat(40))).toBe(false);
    expect(isValidSha1(null)).toBe(false);
    expect(isValidSha1(123)).toBe(false);
  });
});

describe("parseManifest", () => {
  it("真实 schema：取 images/categories/tombstones", () => {
    const res = parseManifest({
      images: [{ hash: HASH_A, fileName: "示例.jpg" }],
      categories: [{ id: "c1", name: "示例分类" }],
      tombstones: [{ id: "i9", kind: "image", deletedAt: 1 }],
    });
    expect(res.images).toHaveLength(1);
    expect(res.categories[0]?.name).toBe("示例分类");
    expect(res.tombstones[0]?.id).toBe("i9");
  });

  it("过滤 hash 非法的 image 条目", () => {
    const res = parseManifest({ images: [{ hash: "bad" }, { hash: HASH_A }] });
    expect(res.images).toHaveLength(1);
    expect(res.images[0]?.hash).toBe(HASH_A);
  });

  it("非对象输入返回空结果", () => {
    expect(parseManifest(null).images).toHaveLength(0);
    expect(parseManifest("string").images).toHaveLength(0);
  });

  it("没有 images 数组时回退到递归收集", () => {
    const res = parseManifest({ payload: { items: [{ hash: HASH_A, fileName: "嵌套.jpg" }] } });
    expect(res.images).toHaveLength(1);
    expect(res.images[0]?.fileName).toBe("嵌套.jpg");
  });
});

describe("mergeManifests", () => {
  it("同 hash 记录级 LWW：updatedAt 大者胜", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, fileName: "旧.jpg", updatedAt: 1000 }],
      }),
      snapshot({
        deviceId: "dev-2",
        images: [{ id: "i2", hash: HASH_A, fileName: "新.jpg", updatedAt: 2000 }],
      }),
    ]);
    expect(merged.get(HASH_A)?.fileName).toBe("新.jpg");
  });

  it("存活记录间 favorite 取或、tags 取并集", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, favorite: false, tags: ["风景"], updatedAt: 2000 }],
      }),
      snapshot({
        deviceId: "dev-2",
        images: [{ id: "i2", hash: HASH_A, favorite: true, tags: ["城市"], updatedAt: 1000 }],
      }),
    ]);
    const item = merged.get(HASH_A);
    expect(item?.favorite).toBe(true);
    expect(item?.tags.slice().sort()).toEqual(["城市", "风景"].sort());
  });

  it("image tombstone 按 id 杀死对应记录", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, updatedAt: 1000 }],
        tombstones: [{ id: "i1", kind: "image", deletedAt: 2000 }],
      }),
    ]);
    expect(merged.has(HASH_A)).toBe(false);
  });

  it("同 hash 下其他存活记录不受该 tombstone 影响", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [
          { id: "i1", hash: HASH_A, fileName: "已删.jpg", updatedAt: 3000 },
          { id: "i2", hash: HASH_A, fileName: "仍在.jpg", updatedAt: 1000 },
        ],
        tombstones: [{ id: "i1", kind: "image", deletedAt: 4000 }],
      }),
    ]);
    expect(merged.get(HASH_A)?.fileName).toBe("仍在.jpg");
  });

  it("记录级 deleted / tombstone 标记同样过滤", () => {
    const merged = mergeManifests([
      snapshot({ deviceId: "dev-1", images: [{ id: "i1", hash: HASH_A, deleted: true, updatedAt: 1000 }] }),
      snapshot({ deviceId: "dev-1", images: [{ id: "i2", hash: HASH_B, tombstone: true, updatedAt: 1000 }] }),
    ]);
    expect(merged.size).toBe(0);
  });

  it("分类名按 id LWW 解析到条目上", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, categoryId: "c1", updatedAt: 1000 }],
        categories: [{ id: "c1", name: "旧名", updatedAt: 1000 }],
      }),
      snapshot({
        deviceId: "dev-2",
        categories: [{ id: "c1", name: "新名", updatedAt: 2000 }],
      }),
    ]);
    expect(merged.get(HASH_A)?.categoryName).toBe("新名");
  });

  it("分类 tombstone 后不再解析出分类名", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, categoryId: "c1", updatedAt: 1000 }],
        categories: [{ id: "c1", name: "将删分类", updatedAt: 1000 }],
        tombstones: [{ id: "c1", kind: "category", deletedAt: 2000 }],
      }),
    ]);
    expect(merged.get(HASH_A)?.categoryName).toBeUndefined();
  });

  it("胜者缺失的展示字段由其他记录回填", () => {
    const merged = mergeManifests([
      snapshot({
        deviceId: "dev-1",
        images: [{ id: "i1", hash: HASH_A, updatedAt: 2000 }],
      }),
      snapshot({
        deviceId: "dev-2",
        images: [{ id: "i2", hash: HASH_A, width: 4000, height: 6000, format: "JPEG", updatedAt: 1000 }],
      }),
    ]);
    const item = merged.get(HASH_A);
    expect(item?.width).toBe(4000);
    expect(item?.height).toBe(6000);
    expect(item?.format).toBe("JPEG");
  });

  it("空输入返回空 Map", () => {
    expect(mergeManifests([]).size).toBe(0);
  });
});
