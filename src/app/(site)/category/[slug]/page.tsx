import { notFound } from "next/navigation";
import { listCategories, listPhotos } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: PageProps<"/category/[slug]">) {
  const { slug: rawSlug } = await params;
  // 中文 slug 经浏览器会以百分号编码到达，比较前先解码
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* 已是明文 */
  }
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { items, total, pageSize } = await listPhotos({ categorySlug: slug });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">
        {category.name} <span className="text-sm text-muted font-normal">{total} 张</span>
      </h1>
      <PhotoGrid initialItems={items} total={total} pageSize={pageSize} query={{ category: slug }} />
    </div>
  );
}
