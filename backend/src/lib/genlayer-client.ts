import { createClient, createAccount } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import { Redis } from "@upstash/redis/cloudflare";
import type { Env } from "./env.js";
import { isContractConfigured } from "./env.js";

// genlayer-js's `createClient` routes `eth_`-prefixed RPC calls (including
// the read-only `eth_call` behind `readContract`) through a
// `window.ethereum` branch whenever no `account` object is attached
// (`isAddress = typeof config.account !== "object"`). `window` does not
// exist in the Workers runtime, so that branch resolves to `undefined` and
// `readContract` crashes decoding it as hex. Attaching an `account` via
// `createAccount()` forces every request through the real fetch-based
// JSON-RPC path instead. This backend never writes to the contract, so the
// ephemeral account this creates is never used to sign or authorize
// anything real.
function client(env: Env) {
  const studionet = {
    id: Number(env.GENLAYER_CHAIN_ID ?? 61999),
    name: "GenLayer StudioNet",
    rpcUrls: { default: { http: [env.GENLAYER_RPC_URL] } },
    nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
    testnet: true,
  } as const;
  return createClient({ chain: studionet, account: createAccount() });
}

// genlayer-js decodes contract dict returns as JS `Map`, not a plain
// object - `JSON.stringify`/Hono's `c.json()` silently serializes a Map as
// `{}` (it has no own enumerable properties), which is how this shipped
// broken initially: no error anywhere, just an empty response. Recursively
// converts Maps (and nested Maps inside arrays/objects) to plain objects
// before anything is handed to `c.json()`.
function toPlain(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries(), ([k, v]) => [k, toPlain(v)]));
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

// GenLayer StudioNet enforces a hard per-account/IP hourly RPC ceiling
// (500 req/hr, per the user). Upstash Redis's atomic INCR gives an exact
// rolling hourly counter across concurrent Workers isolates (unlike a D1
// read-then-write, which has a race window under concurrency) so the
// indexer's cron pass and user-triggered reads can never together exceed
// it. Falls back to a best-effort D1 counter if Redis isn't configured, so
// this still degrades gracefully rather than hard-failing every read.
let redisClient: Redis | null | undefined;

function getRedis(env: Env): Redis | null {
  if (redisClient !== undefined) return redisClient;
  redisClient = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;
  return redisClient;
}

async function checkRpcBudgetRedis(redis: Redis, limit: number): Promise<void> {
  const windowKey = `genlayer_rpc:${Math.floor(Date.now() / 3600000)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) await redis.expire(windowKey, 3600);
  if (count > limit) {
    throw new Error(`GenLayer RPC hourly budget exhausted (${count}/${limit}) - try again after the hour rolls over.`);
  }
}

const RPC_BUDGET_BUCKET = "genlayer_rpc";

async function checkRpcBudgetD1(env: Env, limit: number): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % 3600);

  const row = await env.DB.prepare(
    `SELECT window_started_at, count FROM rate_limit_counters WHERE bucket_key = ?`,
  ).bind(RPC_BUDGET_BUCKET).first<{ window_started_at: string; count: number }>();

  if (!row || Number(row.window_started_at) !== windowStart) {
    await env.DB.prepare(
      `INSERT INTO rate_limit_counters (bucket_key, window_started_at, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at, count = 1`,
    ).bind(RPC_BUDGET_BUCKET, String(windowStart)).run();
    return;
  }

  if (row.count >= limit) {
    throw new Error(`GenLayer RPC hourly budget exhausted (${row.count}/${limit}) - try again after the hour rolls over.`);
  }
  await env.DB.prepare(`UPDATE rate_limit_counters SET count = count + 1 WHERE bucket_key = ?`).bind(RPC_BUDGET_BUCKET).run();
}

async function checkRpcBudget(env: Env): Promise<void> {
  const limit = Number(env.GENLAYER_RPC_MAX_REQUESTS_PER_HOUR ?? 500);
  const redis = getRedis(env);
  if (redis) return checkRpcBudgetRedis(redis, limit);
  return checkRpcBudgetD1(env, limit);
}

export async function readContract<T = unknown>(
  env: Env,
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  if (!isContractConfigured(env)) {
    throw new Error("CONTRACT_ADDRESS is not configured yet - deploy the Intelligent Contract and set it as a secret.");
  }
  await checkRpcBudget(env);
  const result = await client(env).readContract({
    address: env.CONTRACT_ADDRESS as Address,
    functionName,
    args: args as never,
  });
  return toPlain(result) as T;
}
