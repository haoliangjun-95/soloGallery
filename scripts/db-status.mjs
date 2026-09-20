import "dotenv/config";
import mariadb from "mariadb";

function connFromEnv() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  return mariadb.createConnection({
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  });
}

const conn = await connFromEnv();
const p = await conn.query("SELECT COUNT(*) as total, SUM(published=1) as published FROM Photo");
console.log(`图片: total=${Number(p[0].total)} published=${Number(p[0].published ?? 0)}`);
const r = await conn.query(
  "SELECT id, status, `trigger`, newCount, missingCount, total FROM SyncRun ORDER BY id DESC LIMIT 3",
);
console.log("最近同步:");
for (const x of r) {
  console.log(`  #${x.id} ${x.status} ${x.trigger} 新增=${x.newCount} 下架=${x.missingCount} 存活=${x.total}`);
}
await conn.end();
