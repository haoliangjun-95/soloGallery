import SyncClient from "@/components/admin/SyncClient";

export const dynamic = "force-dynamic";

export default function AdminSyncPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">从壁纸桶同步</h1>
      <SyncClient />
    </div>
  );
}
