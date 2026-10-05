const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://crossbench-api.fly.dev";

export function reportTransactionIssue(
  kind: "VALIDATOR_FAILURE" | "TX_FINALITY_STUCK",
  txHash: string,
  functionName: string,
): void {
  // Telemetry is deliberately non-blocking and cannot affect contract state.
  // The backend stores only the transaction identifier and action name.
  void fetch(`${API_URL}/operations/client`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, txHash, functionName }),
    keepalive: true,
  }).catch(() => undefined);
}
