import TagsClient from "@/components/admin/TagsClient";
import { listTags } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminTagsPage() {
  const tags = await listTags(false);
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">标签管理</h1>
      <TagsClient initial={tags} />
    </div>
  );
}
