import "dotenv/config";
import { runSync } from "../src/lib/sync";

const summary = await runSync("manual");
console.log(
  `同步完成: 设备 ${summary.devices} · 存活 ${summary.total} · 新增 ${summary.imported} · 更新 ${summary.updated} · 下架 ${summary.missing} · 跳过 ${summary.skipped}`,
);
if (summary.errors.length) {
  console.error("错误明细:");
  for (const e of summary.errors) console.error(" -", e);
  process.exit(1);
}
process.exit(0);
