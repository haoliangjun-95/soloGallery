/**
 * RSS 2.0 feed 构造（纯函数，无服务端依赖）。
 *
 * 选择 RSS 2.0 + media RSS 扩展而非 Atom：主流阅读器（Feedly/Inoreader/NetNewsWire）
 * 对 media:content 缩略图支持最好；enclosure 强制 length 属性，而缩略图变体的
 * 字节数未入库，media:content 无此要求。
 *
 * 所有用户可控文本（标题来自文件名/EXIF，可能含 & < > 等）经 escapeXml 输出，
 * 不依赖 CDATA——CDATA 无法防御内容中出现 "]]>" 的截断攻击面。
 */

export interface FeedMeta {
  /** 频道标题（settings.siteTitle） */
  title: string;
  /** 频道描述 */
  description: string;
  /** 站点基地址（无尾斜杠） */
  siteUrl: string;
  /** feed 自身绝对地址（atom:link rel="self"） */
  feedUrl: string;
  /** 默认 zh-CN */
  language?: string;
}

export interface FeedItem {
  /** 稳定非 URL 标识（sha1）→ isPermaLink="false" */
  guid: string;
  title: string;
  /** 详情页绝对地址 */
  link: string;
  /** 纯文本摘要（内部转义，勿传 HTML） */
  description?: string;
  /** 发布时间；Invalid Date 会被省略而非抛错 */
  pubDate?: Date;
  /** 缩略图绝对地址 → media:content */
  imageUrl?: string;
}

/** XML 1.0 非法控制字符（\t \n \r 除外）：文件名/EXIF 理论可携带，直出即产出坏 XML */
const ILLEGAL_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function escapeXml(value: string): string {
  return value
    .replace(ILLEGAL_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** pubDate/lastBuildDate 的 RFC-822 形式；Invalid Date 返回 null（toUTCString 会抛 RangeError） */
function rfc822(date: Date | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toUTCString();
}

export function buildRssFeed(
  meta: FeedMeta,
  items: readonly FeedItem[],
  now: Date,
): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">`,
    "<channel>",
    `<title>${escapeXml(meta.title)}</title>`,
    `<link>${escapeXml(meta.siteUrl)}</link>`,
    `<description>${escapeXml(meta.description)}</description>`,
    `<language>${escapeXml(meta.language ?? "zh-CN")}</language>`,
    `<lastBuildDate>${rfc822(now) ?? ""}</lastBuildDate>`,
    `<atom:link href="${escapeXml(meta.feedUrl)}" rel="self" type="application/rss+xml"/>`,
  ];

  for (const it of items) {
    lines.push("<item>");
    lines.push(`<title>${escapeXml(it.title)}</title>`);
    lines.push(`<link>${escapeXml(it.link)}</link>`);
    lines.push(`<guid isPermaLink="false">${escapeXml(it.guid)}</guid>`);
    const pub = rfc822(it.pubDate);
    if (pub) lines.push(`<pubDate>${pub}</pubDate>`);
    if (it.description) lines.push(`<description>${escapeXml(it.description)}</description>`);
    if (it.imageUrl) {
      lines.push(`<media:content url="${escapeXml(it.imageUrl)}" medium="image"/>`);
      lines.push(`<media:title>${escapeXml(it.title)}</media:title>`);
    }
    lines.push("</item>");
  }

  lines.push("</channel>", "</rss>");
  return lines.join("\n");
}
