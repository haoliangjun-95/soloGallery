import { listPhotos } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: PageProps<"/tag/[name]">) {
  const { name } = await params;
  // Next 路由匹配层已完成解码（params 即明文），畸形 %zz 在框架层抛 DecodeError → 400。
  // 页面再 decode 属双重解码：含 % 的合法标签会 URIError 误 404（50%off）或静默查错值（C%AB）（评审 M-1）
  const tag = name;
  const { items, total, pageSize } = await listPhotos({ tag });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">
        #{tag} <span className="text-sm text-muted font-normal">{total} 张</span>
      </h1>
      <PhotoGrid key={tag} initialItems={items} total={total} pageSize={pageSize} query={{ tag }} />
    </div>
  );
}
