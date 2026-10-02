import type { Context, Next } from "hono";
import type { Env } from "../lib/env.js";

// PostgreSQL-backed fixed-window rate limit, keyed by client IP + route.
export function rateLimit(bucket: string, maxRequests: number, windowSeconds: number) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `${bucket}:${ip}`;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = nowSeconds - (nowSeconds % windowSeconds);

    const row = await c.env.DB.prepare(
      `SELECT window_started_at, count FROM rate_limit_counters WHERE bucket_key = ?`,
    ).bind(key).first<{ window_started_at: string; count: number }>();

    if (!row || Number(row.window_started_at) !== windowStart) {
      await c.env.DB.prepare(
        `INSERT INTO rate_limit_counters (bucket_key, window_started_at, count) VALUES (?, ?, 1)
         ON CONFLICT (bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at, count = 1`,
      ).bind(key, String(windowStart)).run();
      return next();
    }

    if (row.count >= maxRequests) {
      return c.json({ error: "rate limit exceeded, try again shortly" }, 429);
    }

    await c.env.DB.prepare(`UPDATE rate_limit_counters SET count = count + 1 WHERE bucket_key = ?`).bind(key).run();
    await next();
  };
}
