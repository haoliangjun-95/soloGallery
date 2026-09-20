import CategoriesClient from "@/components/admin/CategoriesClient";
import { listCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await listCategories(false);
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">分类管理</h1>
      <CategoriesClient initial={categories} />
    </div>
  );
}
