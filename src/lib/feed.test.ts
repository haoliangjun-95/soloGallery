import { describe, expect, it } from "vitest";
import { buildRssFeed, escapeXml, type FeedItem, type FeedMeta } from "./feed";

const NOW = new Date("2026-09-24T08:30:00Z");

const META: FeedMeta = {
  title: "soloGallery",
  description: "最新照片更新",
  siteUrl: "https://example.com",
  feedUrl: "https://example.com/feed.xml",
};

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    guid: "abc123def456",
    title: "海边日落",
    link: "https://example.com/photo/abc123def456",
    ...overrides,
  };
}

describe("escapeXml — XML 文本/属性转义", () => {
  it("转义五个 XML 保留字符", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("混合内容整体转义", () => {
    expect(escapeXml(`<a href="x">&'y'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;y&apos;",
    );
  });

  it("剥离 XML 1.0 非法控制字符，保留 \\t \\n \\r", () => {
    expect(escapeXml("a\u0000b\u0008c\u000Bd\u000Ce\u001Ff")).toBe("abcdef");
    expect(escapeXml("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("中文与 emoji 原样通过", () => {
    expect(escapeXml("海边日落🌅")).toBe("海边日落🌅");
  });
});

describe("buildRssFeed — RSS 2.0 频道骨架", () => {
  it("含 XML 声明、rss 2.0、atom 与 media 命名空间", () => {
    const xml = buildRssFeed(META, [], NOW);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
  });

  it("channel 元信息转义输出，self 链接指向 feedUrl", () => {
    const xml = buildRssFeed(
      { ...META, title: `Tom & Jerry's <gallery>` },
      [],
      NOW,
    );
    expect(xml).toContain("<title>Tom &amp; Jerry&apos;s &lt;gallery&gt;</title>");
    expect(xml).toContain("<link>https://example.com</link>");
    expect(xml).toContain(
      '<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain("<language>zh-CN</language>");
  });

  it("lastBuildDate 为注入 now 的 RFC-822 形式（可确定性测试）", () => {
    expect(buildRssFeed(META, [], NOW)).toContain(
      "<lastBuildDate>Thu, 24 Sep 2026 08:30:00 GMT</lastBuildDate>",
    );
  });

  it("无条目时仍是合法 channel（无 item 标签）", () => {
    const xml = buildRssFeed(META, [], NOW);
    expect(xml).not.toContain("<item>");
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });
});

describe("buildRssFeed — item 渲染", () => {
  it("按传入顺序渲染，标题/链接/描述转义", () => {
    const xml = buildRssFeed(
      META,
      [
        item({ guid: "g1", title: "A & B", description: "x < y" }),
        item({ guid: "g2", title: "C", link: "https://example.com/photo/g2" }),
      ],
      NOW,
    );
    expect(xml.indexOf("<guid")).toBeLessThan(xml.lastIndexOf("<guid"));
    expect(xml.indexOf("A &amp; B")).toBeLessThan(xml.indexOf("<title>C</title>"));
    expect(xml).toContain("<description>x &lt; y</description>");
  });

  it("guid 为非 permalink（sha1 不是 URL），pubDate 用 RFC-822", () => {
    const xml = buildRssFeed(
      META,
      [item({ pubDate: new Date("2025-12-31T23:59:59Z") })],
      NOW,
    );
    expect(xml).toContain('<guid isPermaLink="false">abc123def456</guid>');
    expect(xml).toContain("<pubDate>Wed, 31 Dec 2025 23:59:59 GMT</pubDate>");
  });

  it("缺省 pubDate/description/imageUrl 时不输出对应标签", () => {
    const xml = buildRssFeed(META, [item()], NOW);
    expect(xml).toContain("<item>");
    expect(xml).not.toContain("<pubDate>");
    expect(xml).not.toContain("<description>x");
    expect(xml).not.toContain("media:content");
  });

  it("Invalid Date 的 pubDate 静默省略而非抛 RangeError", () => {
    const xml = buildRssFeed(META, [item({ pubDate: new Date("不是日期") })], NOW);
    expect(xml).not.toContain("<pubDate>");
    expect(xml).toContain("<item>");
  });

  it("imageUrl 输出 media:content + media:title，属性值转义", () => {
    const xml = buildRssFeed(
      META,
      [item({ imageUrl: 'https://minio.local/b/thumbs/a"b.webp' })],
      NOW,
    );
    expect(xml).toContain(
      '<media:content url="https://minio.local/b/thumbs/a&quot;b.webp" medium="image"/>',
    );
    expect(xml).toContain("<media:title>海边日落</media:title>");
  });
});
