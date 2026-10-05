import type { Env } from "./env.js";

export type OperationalEventKind = "INDEXER_FAILURE" | "RPC_BUDGET_EXHAUSTED" | "VALIDATOR_FAILURE" | "TX_FINALITY_STUCK" | "CLEANUP_FAILURE";

export async function recordOperationalEvent(env: Env, kind: OperationalEventKind, message: string, metadata: Record<string, unknown> = {}) {
  await env.DB.prepare(
    `INSERT INTO operational_events (kind, message, metadata_json, created_at) VALUES (?, ?, ?, ?)`,
  ).bind(kind, message.slice(0, 1000), JSON.stringify(metadata), new Date().toISOString()).run();
}

export async function cleanupExpiredData(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const twoDaysAgo = String(Math.floor(Date.now() / 1000) - 2 * 86400);
  await env.DB.withAdvisoryLock("crossbench:cleanup", false, async () => {
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now).run();
    await env.DB.prepare(`DELETE FROM kv_store WHERE expires_at <= ?`).bind(now).run();
    await env.DB.prepare(`DELETE FROM siwe_nonces WHERE expires_at <= ?`).bind(now).run();
    await env.DB.prepare(`DELETE FROM rate_limit_counters WHERE CAST(window_started_at AS BIGINT) < ? AND bucket_key <> 'genlayer_rpc'`).bind(twoDaysAgo).run();
    await env.DB.prepare(`DELETE FROM operational_events WHERE created_at < ?`).bind(new Date(Date.now() - 30 * 86400_000).toISOString()).run();
  });
}
