"use client";

import { use, useCallback, useEffect, useState } from "react";
import { fetchDispute } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { DisputeActions } from "./DisputeActions";
import { EvidenceAssessment } from "./EvidenceAssessment";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";

interface DisputeData {
  id: string;
  claim: string;
  claim_category: string;
  policy_reference: string;
  claimant: string;
  respondent: string;
  status: string;
  stake_wei: string;
  response_deadline: string;
  evidence_deadline: string;
  challenge_deadline: string;
  winner: string;
  bundle_claimant: { kind: string; location: string; description: string }[];
  bundle_respondent: { kind: string; location: string; description: string }[];
  bundle_respondent_submitted: boolean;
  preliminary_verdict: { verdict_code: string; payout_bps: number; claimant_weight: number; respondent_weight: number } | null;
  preliminary_assessment: { id: string; supports: string; relevance: string; source_quality: string; duplicate_of?: string; reason_code: string }[] | null;
  final_verdict: { verdict_code: string; payout_bps: number; claimant_weight: number; respondent_weight: number } | null;
  final_assessment: { id: string; supports: string; relevance: string; source_quality: string; duplicate_of?: string; reason_code: string }[] | null;
  policy_assessment: { source_quality: string; reason_code: string } | null;
  can_accept: boolean;
  can_claim_timeout: boolean;
  can_submit_evidence: boolean;
  can_trigger_evaluation: boolean;
  can_challenge: boolean;
  can_finalize: boolean;
  can_resolve_stalled: boolean;
  source_integrity: { mutated_ids: string[]; duplicate_ids?: string[] } | null;
}

function EvidenceBundleList({ title, items }: { title: string; items: { kind: string; location: string; description: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="label-sm mb-2 text-text-dim">{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="glass-card p-3 text-sm">
            <p className="label-sm text-purple">{item.kind.replaceAll("_", " ")}</p>
            <p className="data-mono mt-1 break-all text-cyan">{item.location}</p>
            <p className="mt-1 text-text-dim">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dispute, setDispute] = useState<DisputeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const data = (await fetchDispute(id, { fresh })) as unknown as DisputeData;
      setDispute(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    const initial = setTimeout(() => load(false), 0);
    const interval = setInterval(() => load(false), 8000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="glass-card border-error/40 p-6 text-error">{error}</div>
      </div>
    );
  }
  if (!dispute) {
    return <div className="mx-auto max-w-3xl px-6 py-16 text-text-dim">Loading...</div>;
  }

  const verdict = dispute.final_verdict ?? dispute.preliminary_verdict;
  const assessment = dispute.final_assessment ?? dispute.preliminary_assessment;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-2 flex items-center justify-between">
        <span className="data-mono text-sm text-text-dim">{dispute.id}</span>
        <StatusBadge status={dispute.status} />
      </div>
      <p className="label-sm mb-2 text-purple">{dispute.claim_category.replaceAll("_", " ")}</p>
      <h1 className="font-headline text-2xl font-semibold text-text-ec">{dispute.claim}</h1>
      <p className="data-mono mt-2 text-sm text-text-dim">Policy reference: {dispute.policy_reference}</p>
      {dispute.policy_assessment && (
        <p className="mt-1 text-xs text-text-dim">Policy source quality: {dispute.policy_assessment.source_quality} · {dispute.policy_assessment.reason_code}</p>
      )}

      {dispute.status === "CREATED" && (
        <DeadlineCountdown deadline={dispute.response_deadline} label="Response window closes in" onExpire={() => load(true)} />
      )}
      {dispute.status === "EVIDENCE_SUBMISSION" && (
        <DeadlineCountdown deadline={dispute.evidence_deadline} label="Evidence window closes in" onExpire={() => load(true)} />
      )}
      {dispute.status === "PRELIMINARY_VERDICT" && (
        <DeadlineCountdown deadline={dispute.challenge_deadline} label="Challenge window closes in" onExpire={() => load(true)} />
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="glass-card p-4">
          <p className="label-sm text-text-dim">Claimant</p>
          <p className="data-mono mt-1 truncate text-text-ec">{dispute.claimant}</p>
        </div>
        <div className="glass-card p-4">
          <p className="label-sm text-text-dim">Respondent</p>
          <p className="data-mono mt-1 truncate text-text-ec">{dispute.respondent || "not yet accepted"}</p>
        </div>
      </div>

      {verdict && (
        <div className="mt-8 glass-card-ai p-6">
          <p className="label-sm mb-2 text-purple">{dispute.final_verdict ? "Final Verdict" : "Preliminary Verdict"}</p>
          <p className="font-headline text-xl font-bold text-text-ec">{verdict.verdict_code.replaceAll("_", " ")}</p>
          <p className="mt-2 text-sm text-text-dim">
            Claimant weight {verdict.claimant_weight} · Respondent weight {verdict.respondent_weight}
            {verdict.payout_bps > 0 && ` · Payout ${(verdict.payout_bps / 100).toFixed(1)}%`}
          </p>
          {dispute.winner && <p className="data-mono mt-2 text-sm text-cyan">Winner: {dispute.winner}</p>}
        </div>
      )}

      {assessment && (
        <div className="mt-8">
          <p className="label-sm mb-3 text-text-dim">Per-item validator assessment</p>
          <EvidenceAssessment items={assessment} />
        </div>
      )}

      {dispute.source_integrity && dispute.source_integrity.mutated_ids.length > 0 && (
        <div className="mt-6 glass-card border-error/40 p-4 text-sm text-error">
          Source integrity warning: evidence item{dispute.source_integrity.mutated_ids.length > 1 ? "s" : ""}{" "}
          {dispute.source_integrity.mutated_ids.join(", ")} resolved to different content when re-fetched at
          finalization than at the preliminary verdict. The final verdict was computed from the re-fetched content.
        </div>
      )}
      {dispute.source_integrity && (dispute.source_integrity.duplicate_ids?.length ?? 0) > 0 && (
        <div className="mt-6 glass-card border-purple/40 p-4 text-sm text-text-dim">
          Duplicate-content evidence {dispute.source_integrity.duplicate_ids!.join(", ")} was retained for auditability but assigned zero verdict weight.
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <EvidenceBundleList title="Claimant's evidence" items={dispute.bundle_claimant} />
        <EvidenceBundleList title="Respondent's evidence" items={dispute.bundle_respondent} />
      </div>

      <div className="mt-10">
        <DisputeActions
          disputeId={dispute.id}
          status={dispute.status}
          claimCategory={dispute.claim_category}
          claimant={dispute.claimant}
          respondent={dispute.respondent}
          stakeWei={dispute.stake_wei}
          canAccept={dispute.can_accept}
          canSubmitEvidence={dispute.can_submit_evidence}
          canTriggerEvaluation={dispute.can_trigger_evaluation}
          canChallenge={dispute.can_challenge}
          canFinalize={dispute.can_finalize}
          canClaimTimeout={dispute.can_claim_timeout}
          canResolveStalled={dispute.can_resolve_stalled}
          bundleRespondentSubmitted={dispute.bundle_respondent_submitted}
          responseDeadline={dispute.response_deadline}
          evidenceDeadline={dispute.evidence_deadline}
          challengeDeadline={dispute.challenge_deadline}
          onDone={() => load(true)}
        />
      </div>
    </div>
  );
}
