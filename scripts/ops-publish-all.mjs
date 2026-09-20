/**
 * 一次性运维：清理僵尸 RUNNING 同步记录、批量发布存量图片、切换同步自动发布。
 *   node scripts/ops-publish-all.mjs [noAutoPublish]
 */
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

const cleaned = await conn.query(
  "UPDATE `SyncRun` SET status='ERROR', error='人工清理僵尸记录', finishedAt=NOW() WHERE status='RUNNING'",
);
console.log("清理 RUNNING 同步记录:", cleaned.affectedRows, "条");

const published = await conn.query("UPDATE `Photo` SET published=1 WHERE missing=0 AND published=0");
console.log("已发布存量图片:", published.affectedRows, "张");

const value = process.argv[2] === "noAutoPublish" ? "false" : "true";
await conn.query(
  "INSERT INTO `Setting` (`key`, value) VALUES ('syncAutoPublish',?) ON DUPLICATE KEY UPDATE value=?",
  [value, value],
);
console.log(`「同步自动发布」已设为 ${value}`);

const p = await conn.query("SELECT COUNT(*) as total, SUM(published=1) as published FROM Photo");
console.log(`当前: total=${Number(p[0].total)} published=${Number(p[0].published ?? 0)}`);
await conn.end();
