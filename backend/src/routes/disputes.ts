import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { isContractConfigured } from "../lib/env.js";
import { readContract } from "../lib/genlayer-client.js";
import { pollOnce, upsertDispute, type DisputeDict } from "../indexer/poll.js";

// Read-only. Every write (create_dispute, accept_dispute, submit_evidence,
// submit_challenge_evidence, finalize_dispute, withdraw_credit, ...) is a
// direct client-side transaction from the frontend, signed by the user's
// own wallet straight to the Intelligent Contract. This backend never
// weighs evidence and never moves stake - it only indexes what the
// contract has already decided, for fast reads and history browsing.
//
// Read-through, not cron-only: the Cron Trigger (src/indexer/poll.ts) is a
// background convenience, not the only path that keeps D1 current. Both
// routes below hit the contract live first and only fall back to whatever
// is in D1 if the live read fails (RPC budget exhausted, transient
// network error) - a user should never have to wait for a scheduled job to
// see their own just-submitted action reflected.
export const disputeRoutes = new Hono<{ Bindings: Env }>();

disputeRoutes.get("/disputes", async (c) => {
  const offset = Number(c.req.query("offset") ?? "0");
  const limit = Math.min(50, Number(c.req.query("limit") ?? "20"));
  const status = c.req.query("status");

  if (isContractConfigured(c.env)) {
    try {
      await pollOnce(c.env);
    } catch (err) {
      console.error("[disputes] live sync before list failed, serving last known index:", (err as Error).message);
    }
  }

  const query = status
    ? `SELECT * FROM disputes WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM disputes ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const stmt = status
    ? c.env.DB.prepare(query).bind(status, limit, offset)
    : c.env.DB.prepare(query).bind(limit, offset);
  const { results } = await stmt.all();
  return c.json({ items: results ?? [] });
});

disputeRoutes.get("/disputes/:id", async (c) => {
  const id = c.req.param("id");

  if (isContractConfigured(c.env)) {
    try {
      const live = await readContract<DisputeDict>(c.env, "get_dispute", [id]);
      await upsertDispute(c.env.DB, live);
      return c.json(live);
    } catch (err) {
      console.error(`[disputes] live read failed for ${id}, falling back to index:`, (err as Error).message);
    }
  }

  const indexed = await c.env.DB.prepare(`SELECT raw_json FROM disputes WHERE id = ?`).bind(id).first<{ raw_json: string }>();
  if (indexed) return c.json(JSON.parse(indexed.raw_json));
  return c.json({ error: "dispute not found" }, 404);
});

disputeRoutes.get("/disputes/:id/evidence", async (c) => {
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare(`SELECT * FROM evidence_items WHERE dispute_id = ?`).bind(id).all();
  return c.json({ items: results ?? [] });
});

disputeRoutes.get("/disputes/:id/verdict", async (c) => {
  const id = c.req.param("id");
  const verdict = await c.env.DB.prepare(`SELECT * FROM verdicts WHERE dispute_id = ?`).bind(id).first();
  if (!verdict) return c.json({ error: "no verdict recorded yet" }, 404);
  return c.json(verdict);
});

disputeRoutes.get("/stats", async (c) => {
  if (!isContractConfigured(c.env)) return c.json({ configured: false });
  const stats = await readContract(c.env, "get_stats", []);
  return c.json(stats);
});
