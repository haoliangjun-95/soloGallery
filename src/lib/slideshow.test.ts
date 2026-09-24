import { describe, expect, it } from "vitest";
import {
  SLIDE_INTERVAL_MS,
  buildPlaylist,
  nextIndex,
  prevIndex,
  toSlideshowPhoto,
  type SlideshowPhoto,
} from "./slideshow";

/** 合成夹具：sha1 即身份，title/displayUrl 由 sha1 派生便于断言 */
const photo = (sha1: string): SlideshowPhoto => ({
  sha1,
  title: `t-${sha1}`,
  displayUrl: `https://cdn.example/${sha1}.webp`,
});

describe("toSlideshowPhoto", () => {
  it("只挑 sha1/title/displayUrl 三字段——剥离 exif/category/tags 等重负载（RSC 序列化面最小化）", () => {
    const card = {
      id: 7,
      sha1: "abc123",
      title: "海边日落",
      fileName: "IMG_1.heic",
      format: "HEIC",
      fileSize: 1024,
      thumbUrl: "https://cdn.example/thumb/abc123.webp",
      displayUrl: "https://cdn.example/display/abc123.webp",
      width: 4000,
      height: 3000,
      shotAt: "2025-08-01T10:00:00.000Z",
      exif: { make: "Canon" },
      category: { name: "风景", slug: "landscape" },
      tags: ["海", "日落"],
      favorite: true,
    };
    expect(toSlideshowPhoto(card)).toEqual({
      sha1: "abc123",
      title: "海边日落",
      displayUrl: "https://cdn.example/display/abc123.webp",
    });
  });

  it("返回新对象，不与入参共享引用", () => {
    const card = { sha1: "a", title: "t", displayUrl: "u", thumbUrl: "x" };
    const picked = toSlideshowPhoto(card);
    expect(picked).not.toBe(card);
    expect(picked).toEqual({ sha1: "a", title: "t", displayUrl: "u" });
  });
});

describe("buildPlaylist", () => {
  it("当前照片在列表中段：从该位置截到页尾，顺序不变（不回卷头部——组件侧 nextIndex 负责循环）", () => {
    const items = [photo("a"), photo("b"), photo("c"), photo("d")];
    const current = photo("c");
    expect(buildPlaylist(current, items).map((p) => p.sha1)).toEqual(["c", "d"]);
  });

  it("当前照片是列表首张：整页即播放列表（返回新数组实例）", () => {
    const items = [photo("a"), photo("b")];
    const result = buildPlaylist(photo("a"), items);
    expect(result.map((p) => p.sha1)).toEqual(["a", "b"]);
    expect(result).not.toBe(items);
  });

  it("当前照片是列表末张：播放列表只含它自己", () => {
    const items = [photo("a"), photo("b")];
    expect(buildPlaylist(photo("b"), items).map((p) => p.sha1)).toEqual(["b"]);
  });

  it("当前照片不在列表中（深翻页/直链进入）：前置当前照片 + 整页列表兜底", () => {
    const items = [photo("a"), photo("b")];
    expect(buildPlaylist(photo("z"), items).map((p) => p.sha1)).toEqual(["z", "a", "b"]);
  });

  it("空列表：播放列表只含当前照片", () => {
    expect(buildPlaylist(photo("z"), []).map((p) => p.sha1)).toEqual(["z"]);
  });

  it("不可变：不改动入参数组与元素对象", () => {
    const items = [photo("a"), photo("b"), photo("c")];
    const current = photo("b");
    const snapshot = JSON.stringify(items);
    buildPlaylist(current, items);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it("命中时优先用列表中的元素对象（displayUrl 以列表页为准，与 current 字段等价）", () => {
    const inList = photo("a");
    const items = [inList, photo("b")];
    const current: SlideshowPhoto = { sha1: "a", title: "旧标题", displayUrl: "旧地址" };
    expect(buildPlaylist(current, items)[0]).toBe(inList);
  });
});

describe("nextIndex / prevIndex", () => {
  it("nextIndex 常规步进", () => {
    expect(nextIndex(2, 5)).toBe(3);
  });

  it("nextIndex 末尾回卷到 0", () => {
    expect(nextIndex(4, 5)).toBe(0);
  });

  it("prevIndex 常规步进", () => {
    expect(prevIndex(3, 5)).toBe(2);
  });

  it("prevIndex 头部回卷到末尾", () => {
    expect(prevIndex(0, 5)).toBe(4);
  });

  it("单元素列表：两个方向都停在 0", () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
  });

  it("空列表防御：不产生 NaN/-1，钳到 0", () => {
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 0)).toBe(0);
  });

  it("越界索引防御：先归一化再步进（组件状态被异常改写时不越界）", () => {
    expect(nextIndex(7, 5)).toBe(3); // 7 % 5 = 2 → 3
    expect(prevIndex(-1, 5)).toBe(3); // -1 归一到 4 → 3
  });
});

describe("SLIDE_INTERVAL_MS", () => {
  it("自动切换间隔为 4 秒（经典画廊节奏，锁常量防误改）", () => {
    expect(SLIDE_INTERVAL_MS).toBe(4000);
  });
});
