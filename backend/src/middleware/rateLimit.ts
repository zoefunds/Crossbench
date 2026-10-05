import type { Context, Next } from "hono";
import type { Env } from "../lib/env.js";

// PostgreSQL-backed fixed-window rate limit, keyed by client IP + route.
export function rateLimit(bucket: string, maxRequests: number, windowSeconds: number) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `${bucket}:${ip}`;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = nowSeconds - (nowSeconds % windowSeconds);

    // One statement is essential here. A SELECT followed by UPDATE lets
    // concurrent requests on different Fly machines undercount each other.
    const row = await c.env.DB.prepare(
      `INSERT INTO rate_limit_counters (bucket_key, window_started_at, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         count = CASE
           WHEN rate_limit_counters.window_started_at <> excluded.window_started_at THEN 1
           ELSE rate_limit_counters.count + 1
         END
       RETURNING count`,
    ).bind(key, String(windowStart)).first<{ count: number }>();

    if (Number(row?.count ?? maxRequests + 1) > maxRequests) {
      return c.json({ error: "rate limit exceeded, try again shortly" }, 429);
    }
    await next();
  };
}
