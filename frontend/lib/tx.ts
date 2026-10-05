import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";
import { reportTransactionIssue } from "./operations";

export type TxPhase = "submitted" | "accepted" | "finalized" | "failed";

export interface TxProgress {
  phase: TxPhase;
  hash: string;
  errorMessage?: string;
}

// Real lifecycle tracking via the SDK's own receipt + consensus_data, never
// a client-side timer and never a string-matched RPC field. A transaction
// can be ACCEPTED/FINALIZED with a failed execution - leader_receipt's
// execution_result is the actual proof, exactly as the contract's own test
// suite checks with tx_execution_succeeded on the Python side.
export function executionSucceeded(tx: { consensus_data?: { leader_receipt?: { execution_result: string }[] } }): boolean {
  const receipt = tx.consensus_data?.leader_receipt?.[0];
  return receipt?.execution_result === "SUCCESS";
}

function isRpcRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /rate.?limit/i.test(message) && /eth_sendRawTransaction|send.*transaction/i.test(message);
}

// StudioNet's own RPC node throttles eth_sendRawTransaction under load -
// this is the network itself, not our backend's read-side budget guard
// (which never sees writes; those go straight from the wallet to the
// chain). Retry with backoff a few times before surfacing a plain,
// actionable message instead of the raw viem/RPC error string.
async function sendWithRetry(
  send: () => Promise<unknown>,
  onProgress: (p: TxProgress) => void,
  maxAttempts = 4,
): Promise<unknown> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (!isRpcRateLimited(err) || attempt === maxAttempts) throw err;
      const waitMs = 1500 * 2 ** (attempt - 1);
      onProgress({
        phase: "submitted",
        hash: "",
        errorMessage: `StudioNet is rate-limiting transactions right now - retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts - 1})...`,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("unreachable");
}

export async function runWrite(
  client: GenLayerClient<GenLayerChain>,
  args: { address: `0x${string}`; functionName: string; args?: unknown[]; value?: bigint },
  onProgress: (p: TxProgress) => void,
): Promise<{ hash: string; succeeded: boolean }> {
  let hash: string;
  try {
    hash = (await sendWithRetry(
      () =>
        client.writeContract({
          address: args.address,
          functionName: args.functionName,
          args: (args.args ?? []) as never,
          value: args.value ?? BigInt(0),
        }),
      onProgress,
    )) as string;
  } catch (err) {
    if (isRpcRateLimited(err)) {
      throw new Error(
        "GenLayer StudioNet is rate-limiting transactions right now. This is the network itself, not this app - please wait a minute and try again.",
      );
    }
    throw err;
  }
  onProgress({ phase: "submitted", hash });

  await client.waitForTransactionReceipt({ hash: hash as never, status: "ACCEPTED" as never });
  onProgress({ phase: "accepted", hash });

  // ACCEPTED is informational only. No caller receives success and no page
  // refresh happens until the SDK confirms FINALIZED below.
  const slowFinalityWarning = setTimeout(() => {
    onProgress({
      phase: "accepted", hash,
      errorMessage: "Finality is taking longer than expected. Keep this page open; no UI state will update until finalization completes.",
    });
    reportTransactionIssue("TX_FINALITY_STUCK", hash, args.functionName);
  }, 120_000);
  const finalized = await client.waitForTransactionReceipt({ hash: hash as never, status: "FINALIZED" as never })
    .finally(() => clearTimeout(slowFinalityWarning));
  const succeeded = executionSucceeded(finalized);
  const finalError = finalized.consensus_data?.leader_receipt?.[0]?.error;
  if (!succeeded) reportTransactionIssue("VALIDATOR_FAILURE", hash, args.functionName);
  onProgress({ phase: succeeded ? "finalized" : "failed", hash, errorMessage: succeeded ? undefined : finalError ?? "Validator consensus or contract execution failed at finality" });
  return { hash, succeeded };
}
