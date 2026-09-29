import Link from "next/link";
import SimilarClient from "@/components/admin/SimilarClient";
import { DHASH_THRESHOLD_PRESETS, parseDhashThreshold } from "@/lib/dhash";
import { countDhashCoverage, listSimilarGroups } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "相似照片 · soloGallery" };

interface Props extends PageProps<"/admin/similar"> {
  /** 重复参数（?t=4&t=6）运行时是数组——parseDhashThreshold 取首元素 */
  searchParams: Promise<{ t?: string | string[] }>;
}

const THRESHOLD_LABELS: Record<number, string> = {
  4: "严格",
  6: "标准",
  10: "宽松",
};

export default async function SimilarPhotosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const threshold = parseDhashThreshold(sp.t);
  const [groups, coverage] = await Promise.all([listSimilarGroups(threshold), countDhashCoverage()]);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">相似照片</h1>
        <p className="mt-1 text-sm text-muted">
          按感知哈希找出连拍/压缩重存的近似图，勾选要保留的照片后批量清理其余。
        </p>
      </header>

      {coverage.hashed < coverage.total ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          感知哈希覆盖 {coverage.hashed}/{coverage.total} 张 —— 存量照片需在服务器跑
          <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5 text-xs">npx tsx scripts/backfill-dhash.mts</code>
          补齐后，相似组才会完整。
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">判定距离：</span>
        {DHASH_THRESHOLD_PRESETS.map((t) => (
          <Link
            key={t}
            href={`/admin/similar?t=${t}`}
            aria-current={t === threshold ? "true" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 transition-colors ${
              t === threshold
                ? "border-foreground/60 bg-foreground/10 text-foreground"
                : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {THRESHOLD_LABELS[t]} {t}
          </Link>
        ))}
        <span className="ml-1 text-xs text-muted">严格=同图重存 · 标准=+紧凑连拍 · 宽松=易混入风格相近的壁纸</span>
      </div>

      <SimilarClient groups={groups} threshold={threshold} />
    </div>
  );
}
