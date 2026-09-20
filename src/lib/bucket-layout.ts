/** 桶内布局约定 —— 与桌面壁纸软件共享同一个桶，画廊只写 display/。 */
export const BUCKET_LAYOUT = {
  originals: "objects", // objects/<sha1> 原图二进制（内容寻址，无扩展名）
  thumbs: "thumbs", //   thumbs/<id>_<hash8>.webp 缩略图（壁纸软件写）
  displays: "display", // display/<sha1>.webp 展示图（画廊写）
  manifests: "manifests", // manifests/<deviceUuid>-<ts>.json 设备清单快照
} as const;

export function originalKey(sha1: string) {
  return `${BUCKET_LAYOUT.originals}/${sha1}`;
}

export function displayKey(sha1: string) {
  return `${BUCKET_LAYOUT.displays}/${sha1}.webp`;
}

export const DISPLAY_WIDTH = 1920;
export const DISPLAY_QUALITY = 82;
