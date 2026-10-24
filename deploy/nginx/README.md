# nginx 反爬配置存档（2026-10-19）

线上 nginx 由宝塔面板管理，配置不在本仓库；此目录是**服务器侧反爬配置的落库存档**，
改动服务器后须同步回这里，保证可重建、可审计。

## 背景

2026-10 日志分析：gallery.haoliangjun.com 17.8 万请求中 88% 来自 GPTBot
（74.7.241.63，穷举 `/?category=…&lens=…&make=…&tag=…&year=…` 筛选组合的笛卡尔积），
另有 meta-externalagent（57.141.18.0/24 全段）扫站。图片流量经本 vhost 的
`/bucket/` 反代 MinIO，因此 nginx 层拦截对图片同样生效。

## 文件对照

| 本目录文件 | 服务器路径 | 加载点 |
| --- | --- | --- |
| `0.sologallery-ratelimit.conf` | `/www/server/panel/vhost/nginx/0.sologallery-ratelimit.conf` | nginx.conf http 块（`include …/vhost/nginx/*.conf`） |
| `antibot.conf` | `/www/server/panel/vhost/nginx/extension/gallery.haoliangjun.com/antibot.conf` | 主 vhost server 块第 13 行 extension include |
| `bucket-proxy.conf` | `/www/server/panel/vhost/nginx/extension/gallery.haoliangjun.com/bucket-proxy.conf` | 同上 |

## 防护面

1. **UA 拦截**（antibot.conf）：AI 训练/采集爬虫与常见扫描器 `return 444`（断连无响应，
   body 0 字节，不进应用）。**/robots.txt 对所有 UA 放行**——遵守 robots 的爬虫必须能读到
   `Disallow: /` 才会彻底停止；若连 robots.txt 也断连，它会把 444 当作暂时故障、持续重试
   囤积的 URL 队列（2026-10-21 实测 GPTBot 换 IP 后日均 4300 次 444）。
   nginx 名单 ⊇ `src/app/robots.ts` 的 `deniedAgents`：差集（facebookexternalhit、扫描器）
   是不认 robots 的，只能靠 UA 拦。
2. **IP deny**：已移除对自报 UA 爬虫的 deny（UA 规则已覆盖且不随 IP 漂移；deny 会把
   robots.txt 也 403，RFC 9309 下 4xx 等于 allow-all）。`deny` 只留给不报 UA 的纯扫描器。
3. **限流**：全站 30r/s burst 80，`/bucket/` 图片 30r/s burst 100，超发 429。
   阈值按真实浏览校准：网格页单秒 60+ 请求（srcset 图片 + Next.js 链接预取），
   原 15r/s burst30/40 曾误伤自家 IP 118 个 429。目标是拦百级/秒的病态突发，
   不是整形正常浏览。vividDeck 桌面端走 9000 S3 直连不经 nginx，不受影响。
4. **防盗链**（bucket-proxy.conf）：`/bucket/` 只放行空 Referer 与自家域名，
   外站热链 403。
5. **XFF 覆写**（主 vhost 一行改动，不入库存档全文）：宝塔默认
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` 是追加模式，
   客户端可自带伪造 XFF 首跳绕过应用层按 IP 限流——已改为 `$remote_addr` 覆写。
   **注意：宝塔面板里改站点代理设置可能重新生成主 vhost conf 并还原此行**，
   改动后需复核。

## 应用/回滚

```bash
# 服务器上：
cd /www/server/panel/vhost/nginx
cp 0.sologallery-ratelimit.conf 0.sologallery-ratelimit.conf.bak-<date>   # 首次部署无旧文件
cd extension/gallery.haoliangjun.com
cp antibot.conf antibot.conf.bak-<date> 2>/dev/null
cp bucket-proxy.conf bucket-proxy.conf.bak-<date>
# 用本目录对应文件覆盖后：
nginx -t && nginx -s reload
# 回滚：恢复 .bak 再 nginx -t && nginx -s reload
```

## 观测与调参

- 日志：`/www/wwwlogs/gallery.haoliangjun.com.log`。**444 同样会记访问日志**（状态列 444、
  字节 0），宝塔统计面板只数日志行、不分状态码——被拦截的爬虫在面板里仍显示为"请求"，
  判断是否真被拦要看状态码与 `body_bytes_sent`，不能只看请求数
- 若正常访客误触 429：按 `awk '$9==429'` 看命中 IP 的 UA 与每秒请求数，再调 rate/burst
- 若自家分享渠道图片 403：看 403 行的 Referer，把对应域名加进 `valid_referers`
