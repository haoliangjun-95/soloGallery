/** 只读探针：抽样桶内原图，统计 GPS 存在性。不写库。npx tsx scripts/gps-probe.mts [数量] */
import "dotenv/config";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { extractExif } from "../src/lib/exif";

const sample = Math.min(40, Number(process.argv[2]) || 20);
const s3 = new S3Client({
  endpoint: `http${process.env.MINIO_USE_SSL === "true" ? "s" : ""}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: process.env.MINIO_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY!, secretAccessKey: process.env.MINIO_SECRET_KEY! },
});

const res = await s3.send(
  new ListObjectsV2Command({ Bucket: process.env.MINIO_BUCKET, Prefix: "objects/", MaxKeys: sample * 2 }),
);
const keys = (res.Contents ?? []).map((o) => o.Key!).slice(0, sample * 2); // 每 2 张取 1，分散抽样
const picked = keys.filter((_, i) => i % 2 === 0).slice(0, sample);

let withGps = 0;
let scanned = 0;
for (const key of picked) {
  const obj = await s3.send(new (await import("@aws-sdk/client-s3")).GetObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: key }));
  const buf = Buffer.from(await obj.Body!.transformToByteArray());
  const exif = await extractExif(buf);
  scanned++;
  if (exif?.gps) {
    withGps++;
    console.log(`  ${key.slice(8, 18)} gps=${exif.gps.lat.toFixed(4)},${exif.gps.lon.toFixed(4)} model=${exif.model ?? "-"}`);
  }
}
console.log(`抽样 ${scanned} 张：有 GPS ${withGps}（${((withGps / scanned) * 100).toFixed(0)}%）`);
process.exit(0);
