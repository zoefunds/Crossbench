const STYLES: Record<string, string> = {
  CREATED: "border-border-ec-strong bg-card text-text-dim",
  EVIDENCE_SUBMISSION: "border-cyan/40 bg-cyan-dim text-cyan",
  PRELIMINARY_VERDICT: "border-purple/40 bg-purple-dim text-purple",
  SETTLED: "border-success/40 bg-success/10 text-success",
  CANCELLED: "border-border-ec-strong bg-card text-text-dim",
  DEFAULTED_NO_RESPONSE: "border-error/40 bg-error/10 text-error",
  NO_CONSENSUS_REFUNDED: "border-error/40 bg-error/10 text-error",
};

const PULSE: Record<string, boolean> = {
  EVIDENCE_SUBMISSION: true,
  PRELIMINARY_VERDICT: true,
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "border-border-ec-strong bg-card text-text-dim";
  return (
    <span className={`label-sm inline-flex items-center gap-1.5 rounded border px-2 py-1 ${style}`}>
      {PULSE[status] && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status.replaceAll("_", " ")}
    </span>
  );
}
