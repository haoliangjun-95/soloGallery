"use client";

import { useEffect, useState } from "react";

/**
 * 后台通用对话框 —— 替代原生 confirm()/prompt()：
 * 原生弹窗无法随暗色玻璃风格定制，且会阻塞渲染线程。
 * 约定：onConfirm/onSubmit 成功后由对话框自身调用 onClose，调用方只需清理状态。
 */

function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（删除等）：确认按钮用红色 */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  useEscape(!busy, onClose);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={confirmLabel}
        className="w-full max-w-sm rounded-2xl border border-edge bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm whitespace-pre-wrap">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${
              danger
                ? "bg-red-500/90 text-white hover:bg-red-500"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PromptDialogProps {
  label: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}

export function PromptDialog({ label, placeholder, submitLabel = "确定", onSubmit, onClose }: PromptDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEscape(!busy, onClose);

  async function submit() {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onSubmit(v);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-sm rounded-2xl border border-edge bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-muted">{label}</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg bg-background border border-edge px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !value.trim()}
            className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {busy ? "处理中…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
