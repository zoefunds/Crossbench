import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { disputeRoutes } from "./routes/disputes.js";
import { socialRoutes } from "./routes/social.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { pollOnce } from "./indexer/poll.js";

const app = new Hono<{ Bindings: Env & { JWT_SECRET: string } }>();

app.use("*", cors({ origin: (origin) => origin, credentials: true }));
app.use("/auth/*", rateLimit("auth", 20, 60));
app.use("/disputes*", rateLimit("read", 120, 60));
app.use("/social/*", rateLimit("social", 30, 60));

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", authRoutes);
app.route("/", disputeRoutes);
app.route("/", socialRoutes);

// Manual reindex trigger, decoupled from the Cron Trigger schedule - useful
// for verifying the indexer itself works independent of cron timing/platform
// behavior, and as an operational escape hatch if a scheduled run is ever
// missed. Protected by a shared secret header so it can't be hammered by
// anyone who finds the URL (it would otherwise let a caller force extra
// GenLayer RPC budget consumption on demand).
app.post("/internal/reindex", async (c) => {
  const secret = c.req.header("X-Internal-Secret");
  if (!secret || secret !== (c.env as Env & { INTERNAL_SECRET?: string }).INTERNAL_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await pollOnce(c.env);
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pollOnce(env));
  },
};
