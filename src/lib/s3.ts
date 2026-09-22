import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { minioConfig } from "./config";

const globalForS3 = globalThis as unknown as { s3?: S3Client };

/** 懒初始化：next build 收集页面数据时不需要 MinIO 配置存在。 */
function getClient(): S3Client {
  if (globalForS3.s3) return globalForS3.s3;
  const cfg = minioConfig();
  const client = new S3Client({
    endpoint: `${cfg.useSSL ? "https" : "http"}://${cfg.endpoint}:${cfg.port}`,
    region: process.env.MINIO_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  globalForS3.s3 = client;
  return client;
}

export const s3: S3Client = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

const bucket = () => minioConfig().bucket;

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function getBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`对象为空: ${key}`);
  return Buffer.from(bytes);
}

export async function putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function presignGet(
  key: string,
  opts: { expiresIn?: number; downloadFileName?: string } = {},
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: opts.downloadFileName
      ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadFileName)}`
      : undefined,
  });
  return getSignedUrl(s3, cmd, { expiresIn: opts.expiresIn ?? 3600 });
}

export async function deleteKey(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
