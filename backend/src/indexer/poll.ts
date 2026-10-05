import type { Env } from "../lib/env.js";
import { isContractConfigured } from "../lib/env.js";
import { readContract } from "../lib/genlayer-client.js";
import type { Database } from "../lib/db.js";
import { recordOperationalEvent } from "../lib/operations.js";

export interface DisputeDict {
  id: string;
  claim: string;
  claim_category: string;
  policy_reference: string;
  claimant: string;
  respondent: string;
  status: string;
  stake_wei: string;
  winner: string;
  created_at: string;
  response_deadline: string;
  evidence_deadline: string;
  challenge_deadline: string;
  bundle_claimant: { kind: string; location: string; description: string }[];
  bundle_respondent: { kind: string; location: string; description: string }[];
  challenge_claimant: { kind: string; location: string; description: string }[];
  challenge_respondent: { kind: string; location: string; description: string }[];
  preliminary_verdict: { verdict_code: string; payout_bps: number; claimant_weight: number; respondent_weight: number } | null;
  preliminary_assessment: unknown[] | null;
  final_verdict: { verdict_code: string; payout_bps: number; claimant_weight: number; respondent_weight: number } | null;
  final_assessment: unknown[] | null;
}

const TERMINAL_STATUSES = new Set(["SETTLED", "CANCELLED", "DEFAULTED_NO_RESPONSE"]);
let lastPollAt = 0;
let pollInFlight: Promise<void> | null = null;

export async function pollOnce(env: Env, force = false): Promise<void> {
  if (pollInFlight) return pollInFlight;
  if (!force && Date.now() - lastPollAt < 30_000) return;
  lastPollAt = Date.now();
  pollInFlight = env.DB.withAdvisoryLock("crossbench:indexer", force, () => pollOnceInternal(env))
    .then(() => undefined)
    .catch(async (err) => {
      await recordOperationalEvent(env, "INDEXER_FAILURE", (err as Error).message).catch(() => undefined);
      throw err;
    })
    .finally(() => { pollInFlight = null; });
  return pollInFlight;
}

export async function upsertDispute(db: Database, d: DisputeDict) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO disputes (
       id, claim, claim_category, policy_reference, claimant, respondent, status, stake_wei,
       winner, created_at, response_deadline, evidence_deadline, challenge_deadline, raw_json, indexed_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (id) DO UPDATE SET
       respondent = excluded.respondent, status = excluded.status, winner = excluded.winner,
       evidence_deadline = excluded.evidence_deadline, challenge_deadline = excluded.challenge_deadline,
       raw_json = excluded.raw_json, indexed_at = excluded.indexed_at`,
  ).bind(
    d.id, d.claim, d.claim_category, d.policy_reference, d.claimant, d.respondent || null, d.status, d.stake_wei,
    d.winner || null, d.created_at, d.response_deadline, d.evidence_deadline || null, d.challenge_deadline || null,
    JSON.stringify(d), now,
  ).run();

  const rows: { item_id: string; side: string; kind: string; location: string; description: string; is_challenge: number }[] = [
    ...d.bundle_claimant.map((it, i) => ({ item_id: `A${i + 1}`, side: "claimant", kind: it.kind, location: it.location, description: it.description, is_challenge: 0 })),
    ...d.bundle_respondent.map((it, i) => ({ item_id: `B${i + 1}`, side: "respondent", kind: it.kind, location: it.location, description: it.description, is_challenge: 0 })),
    ...d.challenge_claimant.map((it, i) => ({ item_id: `CA${i + 1}`, side: "claimant", kind: it.kind, location: it.location, description: it.description, is_challenge: 1 })),
    ...d.challenge_respondent.map((it, i) => ({ item_id: `CB${i + 1}`, side: "respondent", kind: it.kind, location: it.location, description: it.description, is_challenge: 1 })),
  ];
  for (const row of rows) {
    await db.prepare(
      `INSERT INTO evidence_items (dispute_id, item_id, side, kind, location, description, is_challenge)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (dispute_id, item_id) DO NOTHING`,
    ).bind(d.id, row.item_id, row.side, row.kind, row.location, row.description, row.is_challenge).run();
  }

  const verdict = d.final_verdict ?? d.preliminary_verdict;
  const assessment = d.final_assessment ?? d.preliminary_assessment;
  if (verdict && assessment) {
    await db.prepare(
      `INSERT INTO verdicts (dispute_id, stage, verdict_code, payout_bps, claimant_weight, respondent_weight, assessment_json, recorded_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (dispute_id) DO UPDATE SET
         stage = excluded.stage, verdict_code = excluded.verdict_code, payout_bps = excluded.payout_bps,
         claimant_weight = excluded.claimant_weight, respondent_weight = excluded.respondent_weight,
         assessment_json = excluded.assessment_json, recorded_at = excluded.recorded_at`,
    ).bind(
      d.id, d.final_verdict ? "FINAL" : "PRELIMINARY", verdict.verdict_code, verdict.payout_bps,
      verdict.claimant_weight, verdict.respondent_weight, JSON.stringify(assessment), now,
    ).run();
  }
}

async function pollOnceInternal(env: Env): Promise<void> {
  if (!isContractConfigured(env)) return;

  const contractAddress = env.CONTRACT_ADDRESS!.toLowerCase();
  const addressRow = await env.DB.prepare(
    `SELECT value FROM indexer_state WHERE key = 'contract_address'`,
  ).first<{ value: string }>();
  if (addressRow?.value.toLowerCase() !== contractAddress) {
    // The indexed tables are a disposable mirror of one contract. Reusing a
    // dispute-count watermark after a redeploy makes a fresh contract with a
    // lower count look fully indexed, and ID reuse would mix two contracts.
    await env.DB.prepare(`DELETE FROM verdicts`).run();
    await env.DB.prepare(`DELETE FROM evidence_items`).run();
    await env.DB.prepare(`DELETE FROM disputes`).run();
    await env.DB.prepare(`DELETE FROM indexer_state`).run();
    await env.DB.prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('contract_address', ?)`,
    ).bind(contractAddress).run();
  }

  const stats = await readContract<{ total_disputes: string }>(env, "get_stats", []);
  const total = Number(stats.total_disputes);
  const stateRow = await env.DB.prepare(`SELECT value FROM indexer_state WHERE key = 'known_dispute_count'`).first<{ value: string }>();
  const known = Number(stateRow?.value ?? "0");

  let cursor = known;
  while (cursor < total) {
    const pageSize = Math.min(24, total - cursor);
    const page = await readContract<{ items: { id: string }[] }>(env, "list_disputes", [cursor, pageSize]);
    for (const item of page.items) {
      const dispute = await readContract<DisputeDict>(env, "get_dispute", [item.id]);
      await upsertDispute(env.DB, dispute);
    }
    cursor += page.items.length;
    if (page.items.length === 0) throw new Error("Contract returned an empty dispute page before the reported total");
    await env.DB.prepare(
      `INSERT INTO indexer_state (key, value) VALUES ('known_dispute_count', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).bind(String(cursor)).run();
  }

  const active = await env.DB.prepare(
    `SELECT id FROM disputes WHERE status NOT IN (${[...TERMINAL_STATUSES].map(() => "?").join(",")}) LIMIT 50`,
  ).bind(...TERMINAL_STATUSES).all<{ id: string }>();

  for (const row of active.results ?? []) {
    try {
      const dispute = await readContract<DisputeDict>(env, "get_dispute", [row.id]);
      await upsertDispute(env.DB, dispute);
    } catch (err) {
      console.error(`[indexer] failed to refresh dispute ${row.id}`, (err as Error).message);
      await recordOperationalEvent(env, "INDEXER_FAILURE", `Failed to refresh dispute ${row.id}: ${(err as Error).message}`, { disputeId: row.id }).catch(() => undefined);
    }
  }
}
