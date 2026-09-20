import { BUCKET_LAYOUT } from "./bucket-layout";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（参考 .env.example）`);
  return v;
}

export function minioConfig() {
  return {
    endpoint: requireEnv("MINIO_ENDPOINT"),
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKeyId: requireEnv("MINIO_ACCESS_KEY"),
    secretAccessKey: requireEnv("MINIO_SECRET_KEY"),
    bucket: process.env.MINIO_BUCKET ?? "wallpapers",
  };
}

/** 浏览器直连的公共基地址（display/ 与 thumbs/ 前缀公共读）。 */
export function publicBaseUrl(): string {
  const base = requireEnv("MINIO_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const { bucket } = minioConfig();
  return `${base}/${bucket}`;
}

export function publicUrl(key: string): string {
  return `${publicBaseUrl()}/${key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}

export { BUCKET_LAYOUT };
