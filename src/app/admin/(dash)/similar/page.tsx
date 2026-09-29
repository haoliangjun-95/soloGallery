import SimilarClient from "@/components/admin/SimilarClient";
import { countDhashCoverage, listSimilarGroups } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "相似照片 · soloGallery" };

export default async function SimilarPhotosPage() {
  const [groups, coverage] = await Promise.all([listSimilarGroups(), countDhashCoverage()]);

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

      <SimilarClient groups={groups} />
    </div>
  );
}
