import { serve } from "@hono/node-server";
import app from "./index.js";
import { Database, ExpiringStore } from "./lib/db.js";
import type { Env } from "./lib/env.js";
import { validateRuntimeConfig } from "./lib/env.js";
import { pollOnce } from "./indexer/poll.js";
import { cleanupExpiredData, recordOperationalEvent } from "./lib/operations.js";
validateRuntimeConfig(process.env);
const db = new Database(process.env.DATABASE_URL ?? "");
const env: Env = { DB: db, NONCES: new ExpiringStore(db), GENLAYER_NETWORK: process.env.GENLAYER_NETWORK ?? "studionet", GENLAYER_RPC_URL: process.env.GENLAYER_RPC_URL!, CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS, GENLAYER_CHAIN_ID: process.env.GENLAYER_CHAIN_ID, GENLAYER_RPC_MAX_REQUESTS_PER_DAY: process.env.GENLAYER_RPC_MAX_REQUESTS_PER_DAY, UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN, JWT_SECRET: process.env.JWT_SECRET!, INTERNAL_SECRET: process.env.INTERNAL_SECRET, APP_ORIGIN: process.env.APP_ORIGIN! };
const port = Number(process.env.PORT ?? 8080); serve({ fetch: (request) => app.fetch(request, env), port });
const interval = setInterval(() => pollOnce(env).catch((err) => console.error("[indexer]", err)), 120_000);
const cleanupInterval = setInterval(() => cleanupExpiredData(env).catch(async (err) => {
  console.error("[cleanup]", err);
  await recordOperationalEvent(env, "CLEANUP_FAILURE", (err as Error).message).catch(() => undefined);
}), 60 * 60 * 1000);
process.on("SIGTERM", async () => { clearInterval(interval); clearInterval(cleanupInterval); await db.close(); process.exit(0); });
