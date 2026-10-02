"use client";

import { useEffect } from "react";

/**
 * Service Worker 注册（PWA）：仅生产启用——dev 下 SW 会缓存 HMR 产物，
 * 与「build 与 dev 串味须清 .next」同族的坑，直接规避。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
