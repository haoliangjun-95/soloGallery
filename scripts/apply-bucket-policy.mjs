/**
 * 给共享桶设置公共读策略：display/* 与 thumbs/* 允许匿名 GetObject，
 * objects/ 与 manifests/ 保持私有。幂等：先取出旧策略，替换本工具管理的语句再写回。
 *   npm run policy
 */
import "dotenv/config";
import {
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket = process.env.MINIO_BUCKET ?? "wallpapers";
if (!process.env.MINIO_ENDPOINT) {
  console.error("请先在 .env 配置 MINIO_*（参考 .env.example）");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? 9000}`,
  region: process.env.MINIO_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
});

const SID = "sologallery-public-read";
const OUR_RESOURCES = [`arn:aws:s3:::${bucket}/display/*`, `arn:aws:s3:::${bucket}/thumbs/*`];

let statements = [];
try {
  const res = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }));
  const policy = JSON.parse(res.Policy);
  statements = Array.isArray(policy.Statement) ? policy.Statement : [];
} catch (err) {
  if (err.name !== "NoSuchBucketPolicy") throw err;
}

const kept = statements.filter((s) => s.Sid !== SID);
kept.push({
  Sid: SID,
  Effect: "Allow",
  Principal: { AWS: ["*"] },
  Action: ["s3:GetObject"],
  Resource: OUR_RESOURCES,
});

await s3.send(
  new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify({ Version: "2012-10-17", Statement: kept }),
  }),
);

const base = process.env.MINIO_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "(未配置 MINIO_PUBLIC_BASE_URL)";
console.log(`已更新桶策略：公共读 ${OUR_RESOURCES.join(" 、 ")}`);
console.log(`公共访问基地址应为: ${base}/${bucket}/display/<sha1>.webp`);
