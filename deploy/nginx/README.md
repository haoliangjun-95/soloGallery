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

1. **UA 拦截**（antibot.conf）：AI 训练/采集爬虫 `return 444`（断连无响应）。名单与
   `src/app/robots.ts` 的 `deniedAgents` 同步维护。
2. **IP deny**（antibot.conf）：观测到的爬虫源段双保险。
3. **限流**：全站 10r/s burst 20，`/bucket/` 图片 15r/s burst 40，超发 429。
   vividDeck 桌面端走 9000 S3 直连不经 nginx，不受影响。
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

- 日志：`/www/wwwlogs/gallery.haoliangjun.com.log`（444 不留访问日志，deny/403/429 有记录）
- 若正常访客误触 429：调高 `sologallery_general` 的 rate 或 burst
- 若自家分享渠道图片 403：看 403 行的 Referer，把对应域名加进 `valid_referers`
