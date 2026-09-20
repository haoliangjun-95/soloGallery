export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SYNC_ENABLED === "false") return;

  const globalForScheduler = globalThis as unknown as { __sologSchedulerStarted?: boolean };
  if (globalForScheduler.__sologSchedulerStarted) return;
  globalForScheduler.__sologSchedulerStarted = true;

  const cron = await import("node-cron");
  const { syncTick } = await import("./lib/sync");
  cron.schedule("* * * * *", () => {
    void syncTick();
  });
  console.log("[sologallery] 定时同步已启动（每分钟检查，间隔由设置控制）");
}
