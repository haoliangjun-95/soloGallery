/**
 * PWA 图标生成：从桶内站点 logo（display/__site/logo.webp）导出
 * public/icon-192.png / icon-512.png / icon-512-maskable.png（safe-zone 内 70%）
 * 与 src/app/apple-icon.png（180）。深色底 #121212 居中 contain，圆 logo 天然安全。
 * 更换站点 logo 后重跑一次并提交产物。幂等。
 *   npx tsx scripts/gen-pwa-icons.mts
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { getBuffer } from "../src/lib/s3";

const BG = "#121212";

async function render(source: Buffer, size: number, innerRatio: number): Promise<Buffer> {
  return sharp(source)
    .resize(Math.round(size * innerRatio), Math.round(size * innerRatio), { fit: "inside", withoutEnlargement: true })
    .toBuffer()
    .then((inner) =>
      sharp({ create: { width: size, height: size, channels: 4, background: BG } })
        .composite([{ input: inner, gravity: "center" }])
        .png()
        .toBuffer(),
    );
}

const logo = await getBuffer("display/__site/logo.webp").catch(() => null);
if (!logo) {
  console.error("桶内无 display/__site/logo.webp —— 先在后台设置上传站点 logo 再生成");
  process.exit(1);
}

await mkdir("public", { recursive: true });
const jobs: Array<[string, number, number]> = [
  ["public/icon-192.png", 192, 0.86],
  ["public/icon-512.png", 512, 0.86],
  // maskable 安全区：内容压到中心 ~70%，系统裁切圆/圆角不伤 logo
  ["public/icon-512-maskable.png", 512, 0.7],
  ["src/app/apple-icon.png", 180, 0.86],
];
for (const [out, size, ratio] of jobs) {
  await writeFile(out, await render(logo, size, ratio));
  console.log(`✓ ${out} (${size}×${size})`);
}
