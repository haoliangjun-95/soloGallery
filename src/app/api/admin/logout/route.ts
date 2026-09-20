import { json } from "@/lib/api";
import { logout } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await logout();
  return json({ ok: true });
}
