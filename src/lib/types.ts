import type { NormalizedExif } from "./exif";

/** 客户端组件可安全引用的 DTO（无服务端依赖）。 */

export interface PhotoCardDTO {
  id: number;
  sha1: string;
  title: string;
  thumbUrl: string;
  displayUrl: string;
  width: number | null;
  height: number | null;
  shotAt: string | null;
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

export interface AdminPhotoDTO extends PhotoCardDTO {
  fileName: string;
  published: boolean;
  missing: boolean;
  source: "SYNC" | "UPLOAD";
  category: string | null;
}
