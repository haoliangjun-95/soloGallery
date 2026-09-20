import AdminPhotosClient from "@/components/admin/AdminPhotosClient";
import { listCategories, listPhotosAdmin } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, total, pageSize }, categories] = await Promise.all([
    listPhotosAdmin({ page }),
    listCategories(false),
  ]);
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">图片管理</h1>
      <AdminPhotosClient
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        categories={categories}
      />
    </div>
  );
}
