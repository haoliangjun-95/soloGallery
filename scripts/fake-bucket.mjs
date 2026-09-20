/**
 * 启动一个“长得像桌面壁纸软件写入过”的本地 S3 桶（s3rver 内存实现），
 * 用于无真实 MinIO 时的开发/探查。Ctrl+C 退出。
 *
 * 连接参数（配到 .env 即可让画廊连它）：
 *   MINIO_ENDPOINT=127.0.0.1  MINIO_PORT=4571  MINIO_USE_SSL=false
 *   MINIO_ACCESS_KEY=e2e      MINIO_SECRET_KEY=e2e
 */
import {
  BUCKET,
  buildItems,
  phase1Manifests,
  seedManifests,
  seedObjects,
  startFakeBucket,
} from "./fixtures.mjs";

const PORT = Number(process.argv[2] ?? 4571);

const ctx = await startFakeBucket(PORT);
const items = await buildItems();
await seedObjects(ctx, items);
await seedManifests(ctx, phase1Manifests(items));

console.log(`[fake-bucket] http://127.0.0.1:${PORT}  bucket=${BUCKET}`);
console.log(`[fake-bucket] objects=8 thumbs=8 manifests=2（设备A: w1-w6，设备B: w5-w8）`);
console.log(`[fake-bucket] 保持运行中，Ctrl+C 退出`);

process.on("SIGINT", async () => {
  await ctx.stop();
  process.exit(0);
});
