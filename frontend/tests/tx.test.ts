import assert from "node:assert/strict";
import test from "node:test";
import { runWrite, type TxProgress } from "../lib/tx.js";

test("write success and UI refresh remain blocked until FINALIZED", async () => {
  let releaseFinality!: (value: unknown) => void;
  const finality = new Promise((resolve) => { releaseFinality = resolve; });
  const statuses: string[] = [];
  const client = {
    async writeContract() { return "0xabc"; },
    async waitForTransactionReceipt({ status }: { status: string }) {
      statuses.push(status);
      if (status === "ACCEPTED") return {};
      return finality;
    },
  };
  const progress: TxProgress[] = [];
  let complete = false;
  const pending = runWrite(client as never, { address: `0x${"1".repeat(40)}`, functionName: "create_dispute" }, (p) => progress.push(p))
    .then((result) => { complete = true; return result; });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(complete, false);
  assert.deepEqual(statuses, ["ACCEPTED", "FINALIZED"]);
  assert.equal(progress.at(-1)?.phase, "accepted");

  releaseFinality({ consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } });
  assert.deepEqual(await pending, { hash: "0xabc", succeeded: true });
  assert.equal(progress.at(-1)?.phase, "finalized");
});

test("a finalized failed leader receipt is never reported as success", async () => {
  const hash = `0x${"d".repeat(64)}`;
  let telemetry: Record<string, string> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    telemetry = JSON.parse(String(init?.body));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const client = {
    async writeContract() { return hash; },
    async waitForTransactionReceipt({ status }: { status: string }) {
      return status === "ACCEPTED" ? {} : { consensus_data: { leader_receipt: [{ execution_result: "ERROR", error: "reverted" }] } };
    },
  };
  const progress: TxProgress[] = [];
  try {
    const result = await runWrite(client as never, { address: `0x${"2".repeat(40)}`, functionName: "accept_dispute" }, (p) => progress.push(p));
    assert.equal(result.succeeded, false);
    assert.deepEqual(progress.at(-1), { phase: "failed", hash, errorMessage: "reverted" });
    assert.deepEqual(telemetry, { kind: "VALIDATOR_FAILURE", txHash: hash, functionName: "accept_dispute" });
  } finally { globalThis.fetch = originalFetch; }
});
