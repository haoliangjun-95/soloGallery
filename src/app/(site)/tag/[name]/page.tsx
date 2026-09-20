import { listPhotos } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: PageProps<"/tag/[name]">) {
  const { name } = await params;
  const tag = decodeURIComponent(name);
  const { items, total, pageSize } = await listPhotos({ tag });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">
        #{tag} <span className="text-sm text-muted font-normal">{total} 张</span>
      </h1>
      <PhotoGrid initialItems={items} total={total} pageSize={pageSize} query={{ tag }} />
    </div>
  );
}
