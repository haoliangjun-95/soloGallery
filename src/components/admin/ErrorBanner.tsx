"use client";

/**
 * 管理端统一错误横幅（功能 9）：同一段红玻璃样式标记原先在 4 个 Client 内联重复
 * （AdminPhotos/Comments/Tags/Categories），收敛为单一组件。
 * 顺带补 role="alert"——内联版无 role，错误出现时读屏器不播报，只有视力可见。
 */
interface Props {
  /** null/空串时不渲染 */
  error: string | null;
  onClose: () => void;
  /** 布局微调（如 mb-4），与基础类拼接 */
  className?: string;
}

export default function ErrorBanner({ error, onClose, className }: Props) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 ${className ?? ""}`}
    >
      <span className="flex-1">{error}</span>
      <button type="button" onClick={onClose} className="leading-none hover:text-red-200" aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}
