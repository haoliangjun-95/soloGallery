import type { Metadata } from "next";
import { siteUrl } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "soloGallery",
    template: "%s · soloGallery",
  },
  description: "个人图片画廊",
  alternates: {
    types: {
      // RSS 自动发现：<head> 输出 <link rel="alternate" type="application/rss+xml">；
      // 用 siteUrl() 绝对地址——相对路径会被缺省 metadataBase 解析成 localhost
      "application/rss+xml": `${siteUrl()}/feed.xml`,
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
