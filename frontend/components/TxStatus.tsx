"use client";

import type { TxProgress } from "@/lib/tx";

const PHASE_LABEL: Record<TxProgress["phase"], string> = {
  submitted: "Submitted - awaiting consensus",
  accepted: "Accepted by validators - awaiting finality",
  finalized: "Finalized on GenLayer StudioNet",
  failed: "Execution failed",
};

export function TxStatus({ progress }: { progress: TxProgress | null }) {
  if (!progress) return null;
  const isFailed = progress.phase === "failed";
  const isRetryNotice = !isFailed && !progress.hash && !!progress.errorMessage;
  return (
    <div className={`glass-card p-4 ${isFailed ? "border-error/50" : progress.phase === "finalized" ? "border-success/50" : "glow-active"}`}>
      <p className={`label-sm mb-1 ${isFailed ? "text-error" : "text-purple"}`}>{PHASE_LABEL[progress.phase]}</p>
      {progress.hash && <p className="data-mono text-xs text-text-dim break-all">{progress.hash}</p>}
      {progress.errorMessage && (
        <p className={`mt-2 text-sm ${isRetryNotice ? "text-purple" : "text-error"}`}>{progress.errorMessage}</p>
      )}
    </div>
  );
}
