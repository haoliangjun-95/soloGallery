import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/config";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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

// themeColor 自 Next 15 起属 viewport 导出（放 metadata 会有迁移告警）
export const viewport: Viewport = { themeColor: "#121212" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
