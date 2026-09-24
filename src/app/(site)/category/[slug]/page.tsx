import { notFound } from "next/navigation";
import { listCategories, listPhotos } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: PageProps<"/category/[slug]">) {
  // Next 路由匹配层已完成解码，中文 slug 到达 params 时即明文，无需（也不应）二次 decode（评审 M-1 同族）
  const { slug } = await params;
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { items, total, pageSize } = await listPhotos({ categorySlug: slug });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">
        {category.name} <span className="text-sm text-muted font-normal">{total} 张</span>
      </h1>
      <PhotoGrid key={slug} initialItems={items} total={total} pageSize={pageSize} query={{ category: slug }} />
    </div>
  );
}
