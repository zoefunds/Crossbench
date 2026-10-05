import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { disputeRoutes } from "./routes/disputes.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { pollOnce } from "./indexer/poll.js";
import { cleanupExpiredData, recordOperationalEvent } from "./lib/operations.js";
const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: (origin, c) => origin === c.env.APP_ORIGIN ? origin : "", credentials: true, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "DELETE", "OPTIONS"] }));
app.use("/auth/*", rateLimit("auth", 20, 60)); app.use("/disputes*", rateLimit("read", 120, 60));
app.use("/operations/client", rateLimit("client-operations", 10, 60));
app.get("/health", (c) => c.json({ ok: true })); app.route("/", authRoutes); app.route("/", disputeRoutes);
app.post("/operations/client", async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const kind = body?.kind;
  const txHash = body?.txHash;
  const functionName = body?.functionName;
  if ((kind !== "VALIDATOR_FAILURE" && kind !== "TX_FINALITY_STUCK")
      || typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)
      || typeof functionName !== "string" || !/^[a-z_]{1,64}$/.test(functionName)) {
    return c.json({ error: "invalid operational event" }, 400);
  }
  await recordOperationalEvent(c.env, kind, `${kind} for ${functionName}`, { txHash, functionName });
  return c.json({ ok: true }, 202);
});
app.post("/internal/reindex", async (c) => {
  if (!c.env.INTERNAL_SECRET || c.req.header("X-Internal-Secret") !== c.env.INTERNAL_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await pollOnce(c.env, true);
  return c.json({ ok: true });
});
app.post("/internal/cleanup", async (c) => {
  if (!c.env.INTERNAL_SECRET || c.req.header("X-Internal-Secret") !== c.env.INTERNAL_SECRET) return c.json({ error: "unauthorized" }, 401);
  await cleanupExpiredData(c.env);
  return c.json({ ok: true });
});
app.get("/internal/operations", async (c) => {
  if (!c.env.INTERNAL_SECRET || c.req.header("X-Internal-Secret") !== c.env.INTERNAL_SECRET) return c.json({ error: "unauthorized" }, 401);
  const { results } = await c.env.DB.prepare(
    `SELECT kind, message, metadata_json, created_at FROM operational_events ORDER BY created_at DESC LIMIT 100`,
  ).all();
  return c.json({ items: results ?? [] });
});
export default app;
