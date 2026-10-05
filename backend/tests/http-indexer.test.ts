import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/index.js";
import { authRoutes } from "../src/routes/auth.js";
import { upsertDispute, type DisputeDict } from "../src/indexer/poll.js";
import type { Env } from "../src/lib/env.js";

class FakeStatement {
  values: unknown[] = [];
  constructor(
    readonly sql: string,
    private readonly firstValue: unknown = null,
    private readonly runs?: Array<{ sql: string; values: unknown[] }>,
  ) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return this.firstValue as T | null; }
  async all<T>() { return { results: [] as T[] }; }
  async run() { this.runs?.push({ sql: this.sql, values: this.values }); return { success: true }; }
}

function baseEnv(db: unknown): Env {
  return {
    DB: db as Env["DB"], NONCES: {} as Env["NONCES"], GENLAYER_NETWORK: "studionet",
    GENLAYER_RPC_URL: "https://studio.genlayer.com/api", CONTRACT_ADDRESS: `0x${"1".repeat(40)}`,
    GENLAYER_CHAIN_ID: "61999", JWT_SECRET: "j".repeat(32), INTERNAL_SECRET: "i".repeat(24),
    APP_ORIGIN: "https://crossbench-app.vercel.app",
  };
}

test("refresh endpoint atomically consumes a session and sets a cross-site secure cookie", async () => {
  const address = `0x${"a".repeat(40)}`;
  let rotationSql = "";
  const db = {
    prepare(sql: string) {
      if (sql.includes("WITH consumed")) { rotationSql = sql; return new FakeStatement(sql, { address }); }
      return new FakeStatement(sql);
    },
  };
  const env = baseEnv(db);
  const response = await authRoutes.request("http://api/auth/refresh", {
    method: "POST", headers: { Cookie: "refresh_token=one-time-token" },
  }, env);
  assert.equal(response.status, 200);
  const body = await response.json() as { accessToken: string; address: string };
  assert.equal(body.address, address);
  assert.equal(jwt.verify(body.accessToken, env.JWT_SECRET).sub, address);
  assert.match(rotationSql, /DELETE FROM sessions/);
  assert.match(rotationSql, /INSERT INTO sessions/);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=None/i);
  assert.match(cookie, /Path=\/auth/i);
});

test("canonical Vercel origin receives credentialed CORS preflight", async () => {
  const env = baseEnv({ prepare: (sql: string) => new FakeStatement(sql, { count: 1 }) });
  const response = await app.request("http://api/auth/refresh", {
    method: "OPTIONS",
    headers: { Origin: env.APP_ORIGIN, "Access-Control-Request-Method": "POST" },
  }, env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), env.APP_ORIGIN);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

test("client validator telemetry is validated, rate-limited, and persisted", async () => {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return new FakeStatement(sql, sql.includes("RETURNING count") ? { count: 1 } : null, runs);
    },
  };
  const env = baseEnv(db);
  const txHash = `0x${"b".repeat(64)}`;
  const response = await app.request("http://api/operations/client", {
    method: "POST",
    headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "fly-client-ip": "203.0.113.4" },
    body: JSON.stringify({ kind: "VALIDATOR_FAILURE", txHash, functionName: "trigger_evaluation" }),
  }, env);
  assert.equal(response.status, 202);
  assert.ok(runs.some((entry) => entry.sql.includes("operational_events") && entry.values[0] === "VALIDATOR_FAILURE"));
});

test("indexer upsert persists contract state, evidence, and verdict without deciding them", async () => {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const db = { prepare: (sql: string) => new FakeStatement(sql, null, runs) } as unknown as Env["DB"];
  const dispute: DisputeDict = {
    id: "ec-1", claim: "x", claim_category: "FACTUAL_ACCOUNT_DISPUTE", policy_reference: "https://example.com/policy",
    claimant: `0x${"1".repeat(40)}`, respondent: `0x${"2".repeat(40)}`, status: "PRELIMINARY_VERDICT",
    stake_wei: "1", winner: "", created_at: "2026-10-05T00:00:00Z", response_deadline: "1",
    evidence_deadline: "2", challenge_deadline: "3",
    bundle_claimant: [{ kind: "WEB_PAGE", location: "https://example.com/a", description: "claimant source" }],
    bundle_respondent: [{ kind: "WEB_PAGE", location: "https://example.com/b", description: "respondent source" }],
    challenge_claimant: [], challenge_respondent: [],
    preliminary_verdict: { verdict_code: "INCONCLUSIVE", payout_bps: 0, claimant_weight: 0, respondent_weight: 0 },
    preliminary_assessment: [{ id: "A1", supports: "NEITHER", relevance: "LOW" }],
    final_verdict: null, final_assessment: null,
  };
  await upsertDispute(db, dispute);
  assert.ok(runs.some((entry) => entry.sql.includes("INSERT INTO disputes")));
  assert.equal(runs.filter((entry) => entry.sql.includes("INSERT INTO evidence_items")).length, 2);
  assert.ok(runs.some((entry) => entry.sql.includes("INSERT INTO verdicts") && entry.values[1] === "PRELIMINARY"));
});
