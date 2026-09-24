"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { patchById } from "@/lib/optimistic";
import { isOversized, MAX_FILE_BYTES, summarizeQueue, toQueueOutcome } from "@/lib/upload-queue";
import type { QueueStatus } from "@/lib/upload-queue";

/**
 * 上传队列客户端（功能 12）。刻意不收编 useAdminAction：该 hook 面向
 * fetch+JSON 的「busy 门/error 收集/成功回流」三件套，而上传需要 XHR
 * upload.onprogress 的字节级进度与逐项状态机（pending/uploading/done/
 * exists/error），fetch 形状的 hook 装不下——强行适配会丢掉进度事件
 * （取代功能 9 技术债清单中「UploadClient 留功能 12 重做时收编」的备忘）。
 *
 * 超限预检与服务端 route.ts 共用 upload-queue.ts 的 MAX_FILE_BYTES 单一
 * 出处：入队即拦截（立刻看到原因），不再传满 30MB 才吃服务端 error outcome。
 */

interface QueueItem {
  /** 单调递增 id：定位与 React key 的唯一依据（原实现按 File 引用定位 +
   *  name+idx 作 key，同名文件 key 冲突；id 使「逐项重试」可精确寻址） */
  id: number;
  file: File;
  status: QueueStatus;
  progress: number;
  message?: string;
  /** 超限项入队即标记（构造后不变）：确定性失败、重试必然回到同一 error——
   *  隐藏重试按钮并让「清除已完成」连带清除（评审收编 M-1：否则成永久死项，
   *  无任何移除入口、汇总条失败数被永久抬高） */
  oversized?: boolean;
}

const MAX_FILE_MB = MAX_FILE_BYTES / 1024 / 1024;
const OVERSIZED_MESSAGE = `超过 ${MAX_FILE_MB}MB 上限，未上传`;

export default function UploadClient() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(0);

  const summary = summarizeQueue(queue);

  function addFiles(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    // 在 updater 外构造新项：nextIdRef 自增是副作用，放进 setQueue updater
    // 会被 StrictMode 双调用重复计数（保持 updater 纯函数）
    const added: QueueItem[] = images.map((file) => {
      const id = nextIdRef.current++;
      // 超限文件入队即标记 error（不进 pending）：用户立刻看到原因，
      // 不浪费带宽传完 30MB 才吃服务端拒绝
      return isOversized(file)
        ? { id, file, status: "error", progress: 0, message: OVERSIZED_MESSAGE, oversized: true }
        : { id, file, status: "pending", progress: 0 };
    });
    setQueue((prev) => [...prev, ...added]);
  }

  // 评审收编 L-2：patch 收窄到可写字段白名单（同功能 9 乐观 patch 口径）——
  // Partial<QueueItem> 允许误传 id/file 破坏寻址根基且无报错；id/file/oversized
  // 构造后不变。显式类型实参防泛型从 Partial<Pick<…>> 反推退化（a7bd8e2 同款）
  function updateItem(
    id: number,
    patch: Partial<Pick<QueueItem, "status" | "progress" | "message">>,
  ) {
    setQueue((prev) => patchById<QueueItem>(prev, id, patch));
  }

  /** 单文件 XHR 上传：onprogress 字节级进度 → onload 经 toQueueOutcome 判决终态 */
  function uploadOne(item: QueueItem): Promise<void> {
    updateItem(item.id, { status: "uploading", progress: 0 });
    return new Promise<void>((resolve) => {
      // 重试路径的本地兜底：超限项虽已在 addFiles 预标 error，但逐项重试
      // 若放行会白传一整趟——发送前再拦一次，零带宽原地回到 error
      if (isOversized(item.file)) {
        updateItem(item.id, { status: "error", progress: 0, message: OVERSIZED_MESSAGE });
        resolve();
        return;
      }
      const form = new FormData();
      form.append("files", item.file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => {
        // 评审收编 H-1/M-2：终态判决下沉 upload-queue.ts 纯函数 toQueueOutcome
        // 直测——服务端把逐文件错误（sniff UNKNOWN/putBuffer 抛错等）装进
        // HTTP 200 的 outcomes 返回，旧映射只区分 exists、其余 2xx 一律标
        // 「完成」，SVG/基础设施抖动全成静默假成功且错误文案被清成 undefined
        let data: unknown = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // 解析失败保持 null → toQueueOutcome 归为 HTTP 状态码错误
        }
        updateItem(item.id, toQueueOutcome(xhr.status, data));
        resolve();
      };
      xhr.onerror = () => {
        updateItem(item.id, { status: "error", message: "网络错误" });
        resolve();
      };
      // 评审收编 L-1：缺 onabort settle 路径时，浏览器触发 abort（未整页卸载）
      // Promise 永不 settle → startUpload/retryOne 的 await 悬挂 → finally 不执行
      // → running 恒 true 三按钮永久禁用，只能刷新页面
      xhr.onabort = () => {
        updateItem(item.id, { status: "error", message: "已中止" });
        resolve();
      };
      xhr.send(form);
    });
  }

  async function startUpload() {
    if (running) return;
    // 快照本轮目标：循环期间用户仍可拖入新文件，新项留给下一轮（与原实现
    // 的闭包语义一致，但显式快照不依赖「闭包 queue 恰好不变」的隐含前提）
    const targets = queue.filter((q) => q.status === "pending");
    if (!targets.length) return;
    setRunning(true);
    try {
      for (const item of targets) {
        await uploadOne(item);
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  /** 失败项单独重传（功能 12 核心诉求）：与整批共用 running 门，防并发双 XHR */
  async function retryOne(item: QueueItem) {
    if (running) return;
    setRunning(true);
    try {
      await uploadOne(item);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
          dragOver ? "border-foreground/50 bg-foreground/5" : "border-edge hover:border-foreground/30"
        }`}
      >
        <p className="text-muted">拖拽图片到这里，或点击选择文件（支持多选）</p>
        <p className="mt-1 text-xs text-muted/70">
          JPEG / PNG / WebP / HEIC（自动转码生成展示图）· 单张 ≤ {MAX_FILE_MB}MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startUpload}
              disabled={running || summary.pending === 0}
              className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {running ? "上传中…" : `上传 ${summary.pending} 张`}
            </button>
            <button
              type="button"
              // 保留 pending 与可重试的 error：原实现只留 pending，「清除已完成」
              // 会把失败项一并静默清掉、连带销毁唯一的重试入口；超限死项
              // （oversized，重试必然同错）连带清除——评审收编 M-1 的移除入口
              onClick={() =>
                setQueue((prev) =>
                  prev.filter(
                    (q) => q.status === "pending" || (q.status === "error" && !q.oversized),
                  ),
                )
              }
              disabled={running}
              className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-40"
            >
              清除已完成
            </button>
            {summary.settled && !running ? (
              <p role="status" className="text-xs text-muted">
                {[
                  summary.done ? `成功 ${summary.done}` : "",
                  summary.exists ? `跳过（已存在）${summary.exists}` : "",
                  summary.error ? `失败 ${summary.error}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>

          <ul className="space-y-2">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <span className="w-56 truncate" title={item.file.name}>
                  {item.file.name}
                </span>
                <div className="flex-1 h-1.5 rounded bg-foreground/10 overflow-hidden">
                  {/* 评审收编 L-4：动画落 transform scaleX 而非 width——compositor
                      友好，逐 progress 事件不再触发 layout；L-3：补 progressbar 语义 */}
                  <div
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.file.name} 上传进度`}
                    className={`h-full w-full origin-left transition-transform ${
                      item.status === "error" ? "bg-red-500" : item.status === "exists" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ transform: `scaleX(${item.progress / 100})` }}
                  />
                </div>
                <span
                  className={`w-28 text-right text-xs ${
                    item.status === "error" ? "text-red-400" : "text-muted"
                  }`}
                  title={item.message}
                >
                  {item.status === "pending"
                    ? "等待"
                    : item.status === "uploading"
                      ? `${item.progress}%`
                      : item.status === "done"
                        ? "完成"
                        : item.status === "exists"
                          ? "已存在"
                          : "失败"}
                </span>
                {/* 评审收编 M-1：超限项隐藏重试（确定性失败的可重试 affordance
                    是误导，点击只会 uploading→error 原地空转）；L-3：补 per-file
                    可访问名，读屏器 N 行中不再只听到裸「重试」 */}
                {item.status === "error" && !item.oversized ? (
                  <button
                    type="button"
                    onClick={() => void retryOne(item)}
                    disabled={running}
                    aria-label={`重试 ${item.file.name}`}
                    className="shrink-0 rounded-lg border border-edge px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
                  >
                    重试
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
