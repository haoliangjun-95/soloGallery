import { notFound } from "next/navigation";
import { listPhotos } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: PageProps<"/tag/[name]">) {
  const { name } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(name);
  } catch {
    // 畸形百分号编码（如 /tag/%zz）：URIError 应 404 而非落 error.tsx 呈 500 观感（对齐 category 页先例）
    notFound();
  }
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
