"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface QueueItem {
  file: File;
  status: "pending" | "uploading" | "done" | "exists" | "error";
  progress: number;
  message?: string;
}

export default function UploadClient() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setQueue((prev) => [
      ...prev,
      ...images.map((file) => ({ file, status: "pending" as const, progress: 0 })),
    ]);
  }

  function updateItem(file: File, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.file === file ? { ...item, ...patch } : item)));
  }

  async function startUpload() {
    if (running) return;
    setRunning(true);
    try {
      for (const item of queue) {
        if (item.status !== "pending") continue;
        updateItem(item.file, { status: "uploading", progress: 0 });
        await new Promise<void>((resolve) => {
          const form = new FormData();
          form.append("files", item.file);
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/admin/upload");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              updateItem(item.file, { progress: Math.round((e.loaded / e.total) * 100) });
            }
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText);
              const outcome = data.outcomes?.[0];
              if (xhr.status >= 200 && xhr.status < 300) {
                updateItem(item.file, {
                  status: outcome?.status === "exists" ? "exists" : "done",
                  progress: 100,
                  message: outcome?.status === "exists" ? "已存在（sha1 相同），跳过" : undefined,
                });
              } else {
                updateItem(item.file, {
                  status: "error",
                  message: outcome?.error ?? data.error ?? `HTTP ${xhr.status}`,
                });
              }
            } catch {
              updateItem(item.file, { status: "error", message: `HTTP ${xhr.status}` });
            }
            resolve();
          };
          xhr.onerror = () => {
            updateItem(item.file, { status: "error", message: "网络错误" });
            resolve();
          };
          xhr.send(form);
        });
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;

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
        <p className="mt-1 text-xs text-muted/70">JPEG / PNG / WebP / HEIC（自动转码生成展示图）</p>
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={startUpload}
              disabled={running || pendingCount === 0}
              className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {running ? "上传中…" : `上传 ${pendingCount} 张`}
            </button>
            <button
              type="button"
              onClick={() => setQueue((prev) => prev.filter((q) => q.status === "pending"))}
              disabled={running}
              className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-40"
            >
              清除已完成
            </button>
          </div>

          <ul className="space-y-2">
            {queue.map((item, idx) => (
              <li key={`${item.file.name}-${idx}`} className="flex items-center gap-3 text-sm">
                <span className="w-56 truncate" title={item.file.name}>
                  {item.file.name}
                </span>
                <div className="flex-1 h-1.5 rounded bg-foreground/10 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      item.status === "error" ? "bg-red-500" : item.status === "exists" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${item.progress}%` }}
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
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
