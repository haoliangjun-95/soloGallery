import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 服务自报 localhost，用 127.0.0.1 访问时会被跨域保护拦截，
  // 导致客户端水合不启动（页面无任何交互）；生产模式不受影响
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
