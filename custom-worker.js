// Worker tuỳ biến bọc worker OpenNext để thêm lịch chạy (cron) — CEO
// 2026-10-04: email nhắc việc 17h giờ VN. Lịch khai báo ở wrangler.jsonc
// (triggers.crons, giờ UTC). Cron gọi thẳng handler của app (không qua
// mạng) vào route /api/cron/daily-reminders, kèm CRON_SECRET (wrangler
// secret) để route xác thực. File .js để next build/tsc không đụng tới —
// .open-next/worker.js chỉ có sau bước build.
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    const request = new Request("https://crm.thuenhanh.vn/api/cron/daily-reminders", {
      method: "POST",
      headers: { "x-cron-secret": env.CRON_SECRET ?? "" },
    });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
