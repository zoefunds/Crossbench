import assert from "node:assert/strict";
import test from "node:test";
import { checkRpcBudgetDatabase, checkRpcBudgetRedis } from "../src/lib/genlayer-client.js";
import { pollOnce } from "../src/indexer/poll.js";
import type { Env } from "../src/lib/env.js";

test("RPC budget uses one atomic upsert and rejects the first excess request", async () => {
  const statements: string[] = [];
  const fake = {
    DB: {
      prepare(statement: string) {
        statements.push(statement);
        return { bind() { return this; }, async first() { return { count: 11 }; }, async run() { return { success: true }; } };
      },
    },
  } as unknown as Env;
  await assert.rejects(checkRpcBudgetDatabase(fake, 10), /exhausted \(11\/10\)/);
  assert.ok(statements.some((sql) => /ON CONFLICT/.test(sql) && /RETURNING count/.test(sql)));
});

test("Redis RPC budget exhaustion is persisted as an operational event", async () => {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const fake = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) { runs.push({ sql, values }); return this; },
          async run() { return { success: true }; },
        };
      },
    },
  } as unknown as Env;
  const redis = { async incr() { return 11; }, async expire() { return 1; } };
  await assert.rejects(checkRpcBudgetRedis(fake, redis, 10), /exhausted \(11\/10\)/);
  assert.ok(runs.some((entry) => entry.sql.includes("operational_events") && entry.values[0] === "RPC_BUDGET_EXHAUSTED"));
});

test("forced indexing takes the cross-machine advisory lock in wait mode", async () => {
  let lock: { key: string; wait: boolean } | undefined;
  const fake = {
    CONTRACT_ADDRESS: undefined,
    DB: {
      async withAdvisoryLock(key: string, wait: boolean, work: () => Promise<void>) {
        lock = { key, wait };
        await work();
      },
    },
  } as unknown as Env;
  await pollOnce(fake, true);
  assert.deepEqual(lock, { key: "crossbench:indexer", wait: true });
});
