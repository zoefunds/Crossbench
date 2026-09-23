const STYLES: Record<string, string> = {
  CREATED: "border-text-dim text-text-dim",
  EVIDENCE_SUBMISSION: "border-cyan text-cyan",
  PRELIMINARY_VERDICT: "border-purple text-purple",
  SETTLED: "border-success text-success",
  CANCELLED: "border-text-dim text-text-dim",
  DEFAULTED_NO_RESPONSE: "border-error text-error",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "border-text-dim text-text-dim";
  return (
    <span className={`label-sm inline-block rounded-sm border px-2 py-1 ${style}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
