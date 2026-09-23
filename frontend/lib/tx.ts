import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";

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

export async function runWrite(
  client: GenLayerClient<GenLayerChain>,
  args: { address: `0x${string}`; functionName: string; args?: unknown[]; value?: bigint },
  onProgress: (p: TxProgress) => void,
): Promise<{ hash: string; succeeded: boolean }> {
  const hash = (await client.writeContract({
    address: args.address,
    functionName: args.functionName,
    args: (args.args ?? []) as never,
    value: args.value ?? BigInt(0),
  })) as unknown as string;
  onProgress({ phase: "submitted", hash });

  const accepted = await client.waitForTransactionReceipt({ hash: hash as never, status: "ACCEPTED" as never });
  if (!executionSucceeded(accepted)) {
    onProgress({ phase: "failed", hash, errorMessage: accepted.consensus_data?.leader_receipt?.[0]?.error ?? "execution failed" });
    return { hash, succeeded: false };
  }
  onProgress({ phase: "accepted", hash });

  const finalized = await client.waitForTransactionReceipt({ hash: hash as never, status: "FINALIZED" as never });
  const succeeded = executionSucceeded(finalized);
  onProgress({ phase: succeeded ? "finalized" : "failed", hash, errorMessage: succeeded ? undefined : "execution failed at finality" });
  return { hash, succeeded };
}
