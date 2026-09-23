"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useGenLayerClient, CONTRACT_ADDRESS } from "@/lib/genlayer";
import { runWrite, type TxProgress } from "@/lib/tx";
import { EvidenceBundleEditor, type EvidenceItem } from "@/components/EvidenceBundleEditor";
import { TxStatus } from "@/components/TxStatus";
import { DISPUTE_EXAMPLES } from "@/lib/exampleData";

interface Props {
  disputeId: string;
  status: string;
  claimCategory: string;
  claimant: string;
  respondent: string;
  stakeWei: string;
  canAccept: boolean;
  canSubmitEvidence: boolean;
  canTriggerEvaluation: boolean;
  canChallenge: boolean;
  canFinalize: boolean;
  canClaimTimeout: boolean;
  bundleRespondentSubmitted: boolean;
  onDone: () => void;
}

export function DisputeActions(props: Props) {
  const { address } = useAccount();
  const client = useGenLayerClient();
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<EvidenceItem[]>([{ kind: "WEB_PAGE", location: "", description: "" }]);
  const [challengeItems, setChallengeItems] = useState<EvidenceItem[]>([{ kind: "WEB_PAGE", location: "", description: "" }]);

  function fillRespondentExample() {
    const example = DISPUTE_EXAMPLES.find((e) => e.category === props.claimCategory) ?? DISPUTE_EXAMPLES[0];
    setItems(example.respondentItems);
  }

  function fillChallengeExample() {
    const example = DISPUTE_EXAMPLES.find((e) => e.category === props.claimCategory) ?? DISPUTE_EXAMPLES[0];
    setChallengeItems([example.claimantItems[0]]);
  }

  const isClaimant = address?.toLowerCase() === props.claimant.toLowerCase();
  const isRespondent = props.respondent && address?.toLowerCase() === props.respondent.toLowerCase();
  const isParty = isClaimant || isRespondent;

  async function act(functionName: string, args: unknown[], value?: bigint) {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { succeeded } = await runWrite(client, { address: CONTRACT_ADDRESS, functionName, args, value }, setProgress);
      if (succeeded) props.onDone();
      else setError("Transaction executed but did not succeed. See status above.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!client) {
    return <p className="text-sm text-text-dim">Connect your wallet to interact with this dispute.</p>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="glass-card border-error/40 p-4 text-sm text-error">{error}</div>}
      <TxStatus progress={progress} />

      {props.canAccept && !isClaimant && (
        <div className="glass-card p-5">
          <p className="mb-3 font-semibold text-text-ec">Accept this dispute as respondent</p>
          <p className="mb-4 text-sm text-text-dim">Counter-staking exactly {Number(props.stakeWei) / 1e18} GEN opens the evidence window.</p>
          <button
            disabled={busy}
            onClick={() => act("accept_dispute", [props.disputeId], BigInt(props.stakeWei))}
            className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40"
          >
            Counter-stake and accept
          </button>
        </div>
      )}

      {props.canSubmitEvidence && isRespondent && !props.bundleRespondentSubmitted && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-text-ec">Submit your evidence bundle</p>
            <button type="button" onClick={fillRespondentExample} className="text-xs font-semibold text-purple hover:underline">
              Fill example data
            </button>
          </div>
          <EvidenceBundleEditor items={items} onChange={setItems} max={3} />
          <button
            disabled={busy || items.some((i) => i.location.length < 8 || i.description.length < 8)}
            onClick={() => act("submit_evidence", [props.disputeId, JSON.stringify(items)])}
            className="mt-4 rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40"
          >
            Pin evidence bundle
          </button>
        </div>
      )}

      {props.canTriggerEvaluation && (
        <div className="glass-card p-5">
          <p className="mb-3 font-semibold text-text-ec">Both bundles are pinned</p>
          <p className="mb-4 text-sm text-text-dim">Anyone may now trigger independent validator assessment.</p>
          <button disabled={busy} onClick={() => act("trigger_evaluation", [props.disputeId])} className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40">
            Trigger evaluation
          </button>
        </div>
      )}

      {props.canChallenge && isParty && (
        <div className="glass-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-text-ec">Submit additional challenge evidence</p>
            <button type="button" onClick={fillChallengeExample} className="text-xs font-semibold text-purple hover:underline">
              Fill example data
            </button>
          </div>
          <p className="mb-4 text-sm text-text-dim">Additive only - up to 2 more items. Cannot replace your original bundle.</p>
          <EvidenceBundleEditor items={challengeItems} onChange={setChallengeItems} max={2} />
          <button
            disabled={busy}
            onClick={() => act("submit_challenge_evidence", [props.disputeId, JSON.stringify(challengeItems)])}
            className="mt-4 rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40"
          >
            Submit challenge evidence
          </button>
        </div>
      )}

      {props.canFinalize && (
        <div className="glass-card p-5">
          <p className="mb-3 font-semibold text-text-ec">Challenge window closed</p>
          <button disabled={busy} onClick={() => act("finalize_dispute", [props.disputeId])} className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40">
            Finalize and settle
          </button>
        </div>
      )}

      {props.canClaimTimeout && isClaimant && (
        <div className="glass-card p-5">
          <p className="mb-3 font-semibold text-text-ec">Respondent never accepted</p>
          <button disabled={busy} onClick={() => act("claim_response_timeout", [props.disputeId])} className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40">
            Claim default judgment and refund
          </button>
        </div>
      )}

      {props.status === "SETTLED" && isParty && (
        <div className="glass-card p-5">
          <p className="mb-3 font-semibold text-text-ec">Withdraw your settled balance</p>
          <button disabled={busy} onClick={() => act("withdraw_credit", [address])} className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40">
            Withdraw
          </button>
        </div>
      )}
    </div>
  );
}
