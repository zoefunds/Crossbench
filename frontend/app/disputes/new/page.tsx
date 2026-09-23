"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useGenLayerClient, CONTRACT_ADDRESS, isContractConfigured } from "@/lib/genlayer";
import { runWrite, type TxProgress } from "@/lib/tx";
import { EvidenceBundleEditor, type EvidenceItem } from "@/components/EvidenceBundleEditor";
import { TxStatus } from "@/components/TxStatus";
import { DISPUTE_EXAMPLES } from "@/lib/exampleData";

const CATEGORIES = [
  { value: "MODERATION_POLICY_VIOLATION", label: "Moderation - policy violation" },
  { value: "MODERATION_WRONGFUL_ACTION", label: "Moderation - wrongful action" },
  { value: "CONTENT_LISTING_MISMATCH", label: "Listing does not match description" },
  { value: "FACTUAL_ACCOUNT_DISPUTE", label: "Conflicting factual accounts" },
];

export default function NewDisputePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const client = useGenLayerClient();

  const [claim, setClaim] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [policyRef, setPolicyRef] = useState("");
  const [stake, setStake] = useState("0.05");
  const [items, setItems] = useState<EvidenceItem[]>([{ kind: "WEB_PAGE", location: "", description: "" }]);
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);

  function fillExample() {
    const example = DISPUTE_EXAMPLES[exampleIndex % DISPUTE_EXAMPLES.length];
    setExampleIndex((i) => i + 1);
    setCategory(example.category);
    setClaim(example.claim);
    setPolicyRef(example.policyReference);
    setItems(example.claimantItems);
  }

  const claimValid = claim.trim().length >= 40;
  const policyRefValid = policyRef.trim().length >= 8;
  const itemsValid = items.length >= 1 && items.every((i) => i.location.trim().length >= 8 && i.description.trim().length >= 8);
  const canSubmit = claimValid && policyRefValid && itemsValid && Number(stake) > 0 && isConnected && !!client && isContractConfigured;

  async function handleSubmit() {
    if (!client || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { hash, succeeded } = await runWrite(
        client,
        {
          address: CONTRACT_ADDRESS,
          functionName: "create_dispute",
          args: [claim.trim(), category, policyRef.trim(), JSON.stringify(items)],
          value: parseEther(stake),
        },
        setProgress,
      );
      if (succeeded) {
        router.push(`/disputes?opened=${hash}`);
      } else {
        setError("The transaction did not execute successfully. See status above.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold text-text-ec">Open a Dispute</h1>
          <p className="mt-2 text-text-dim">
            State a specific, falsifiable claim and lock your stake. The respondent has 24 hours to counter-stake
            and accept, then both sides have 72 hours to submit pinned evidence.
          </p>
        </div>
        <button
          type="button"
          onClick={fillExample}
          className="shrink-0 rounded border border-purple/50 px-4 py-2 text-sm font-semibold text-purple transition hover:bg-purple-dim"
        >
          Fill example data
        </button>
      </div>
      <p className="mt-2 text-xs text-text-dim">
        &quot;Fill example data&quot; loads a complete, real moderation-appeal scenario - real Wikipedia
        reference URLs and realistic claim text - so you can test the full flow without writing your own case.
      </p>

      {!isContractConfigured && (
        <div className="mt-6 glass-card border-error/40 p-4 text-sm text-error">
          The Intelligent Contract address is not configured yet on this deployment.
        </div>
      )}

      <div className="mt-8 space-y-6">
        <div>
          <label className="label-sm mb-2 block text-text-dim">Claim category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-text-ec"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-sm mb-2 block text-text-dim">Claim (specific and falsifiable, 40-1800 characters)</label>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={4}
            placeholder='e.g. "The platform removed my post citing rule 4.2, but the post never referenced the restricted topic."'
            className="w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-text-ec placeholder:text-text-dim/60"
          />
          {!claimValid && claim.length > 0 && <p className="mt-1 text-xs text-error">At least 40 characters - vague grievances are rejected structurally.</p>}
        </div>

        <div>
          <label className="label-sm mb-2 block text-text-dim">Policy / agreement reference</label>
          <input
            value={policyRef}
            onChange={(e) => setPolicyRef(e.target.value)}
            placeholder="https://platform.example.com/policy#rule-4.2"
            className="data-mono w-full rounded border border-border-ec bg-navy-elevated px-3 py-2 text-sm text-text-ec placeholder:text-text-dim/60"
          />
        </div>

        <div>
          <label className="label-sm mb-2 block text-text-dim">Your evidence bundle (pinned - immutable once submitted, max 3 items)</label>
          <EvidenceBundleEditor items={items} onChange={setItems} max={3} />
        </div>

        <div>
          <label className="label-sm mb-2 block text-text-dim">Stake (GEN)</label>
          <input
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="data-mono w-40 rounded border border-border-ec bg-navy-elevated px-3 py-2 text-text-ec"
          />
          <p className="mt-1 text-xs text-text-dim">The respondent must match this exactly to accept.</p>
        </div>

        {error && <div className="glass-card border-error/40 p-4 text-sm text-error">{error}</div>}
        <TxStatus progress={progress} />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded px-6 py-3 font-semibold text-navy bg-cyan transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!isConnected ? "Connect your wallet to continue" : submitting ? "Submitting..." : `Stake ${stake} GEN and open dispute`}
        </button>
      </div>
    </div>
  );
}
