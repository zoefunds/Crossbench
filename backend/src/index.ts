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

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pollOnce(env));
  },
};
