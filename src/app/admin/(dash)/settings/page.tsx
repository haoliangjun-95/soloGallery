import SettingsClient from "@/components/admin/SettingsClient";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">站点设置</h1>
      <SettingsClient initial={settings} />
    </div>
  );
}
