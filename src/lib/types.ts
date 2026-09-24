import type { NormalizedExif } from "./exif";

/** 客户端组件可安全引用的 DTO（无服务端依赖）。 */

export interface PhotoCardDTO {
  id: number;
  sha1: string;
  title: string;
  fileName: string;
  format: string;
  fileSize: number;
  thumbUrl: string;
  /** 网格变体 srcset 描述符串（"…-400w.webp 400w, …-800w.webp 800w"，功能 10）；
   *  未生成变体（老照片 gridReady=false）为 null——浏览器对 srcset 候选专用、
   *  失败不回落 src，必须条件省略而非恒输出 */
  thumbSrcset: string | null;
  displayUrl: string;
  width: number | null;
  height: number | null;
  shotAt: string | null;
  exif: NormalizedExif | null;
  category: { name: string; slug: string } | null;
  tags: string[];
  favorite: boolean;
}

export interface CommentDTO {
  id: number;
  nickname: string;
  content: string;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
}

export interface PhotoDetailDTO {
  id: number;
  sha1: string;
  title: string;
  description: string | null;
  fileName: string;
  format: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  thumbUrl: string;
  displayUrl: string;
  shotAt: string | null;
  exif: NormalizedExif | null;
  category: { name: string; slug: string } | null;
  tags: string[];
  comments: CommentDTO[];
  originalUrl: string;
}

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface TagDTO {
  id: number;
  name: string;
  count: number;
}

export interface CommentAdminDTO extends CommentDTO {
  status: "PENDING" | "APPROVED" | "SPAM";
  email: string | null;
  ip: string | null;
  photoTitle: string;
  photoSha1: string;
}

export interface AdminPhotoDTO extends Omit<PhotoCardDTO, "category"> {
  published: boolean;
  missing: boolean;
  source: "SYNC" | "UPLOAD";
  category: string | null;
}
