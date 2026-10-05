"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { fetchDisputes, type DisputeSummary } from "@/lib/api";
import { useGenLayerClient, CONTRACT_ADDRESS, isContractConfigured } from "@/lib/genlayer";
import { StatusBadge } from "@/components/StatusBadge";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";

function activeDeadline(dispute: DisputeSummary) {
  if (dispute.status === "CREATED") return { value: dispute.response_deadline, label: "Response closes in" };
  if (dispute.status === "EVIDENCE_SUBMISSION" && dispute.evidence_deadline) return { value: dispute.evidence_deadline, label: "Evidence closes in" };
  if (dispute.status === "PRELIMINARY_VERDICT" && dispute.challenge_deadline) return { value: dispute.challenge_deadline, label: "Challenge closes in" };
  return null;
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const client = useGenLayerClient();
  const [disputes, setDisputes] = useState<DisputeSummary[]>([]);
  const [credit, setCredit] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    fetchDisputes({ limit: 50 })
      .then(({ items }) => setDisputes(items.filter((d) => d.claimant.toLowerCase() === address.toLowerCase() || d.respondent?.toLowerCase() === address.toLowerCase())))
      .catch(() => setDisputes([]));
  }, [address]);

  useEffect(() => {
    if (!client || !address || !isContractConfigured) return;
    client
      .readContract({ address: CONTRACT_ADDRESS, functionName: "get_credit", args: [address] })
      .then((v) => setCredit(String(v)))
      .catch(() => setCredit(null));
  }, [client, address]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-text-dim">
        Connect your wallet to view your profile.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-headline text-3xl font-bold text-text-ec">Profile</h1>
      <p className="data-mono mt-2 break-all text-sm text-text-dim">{address}</p>

      <div className="mt-6 glass-card p-5">
        <p className="label-sm text-text-dim">Withdrawable credit</p>
        <p className="data-mono mt-1 text-2xl text-cyan">{credit ? (Number(credit) / 1e18).toFixed(4) : "0.0000"} GEN</p>
      </div>

      <h2 className="label-sm mt-10 mb-4 text-text-dim">Your disputes</h2>
      {disputes.length === 0 && <p className="text-sm text-text-dim">No disputes yet.</p>}
      <div className="space-y-3">
        {disputes.map((d) => {
          const deadline = activeDeadline(d);
          return (
          <Link key={d.id} href={`/disputes/${d.id}`} className="glass-card block p-4 transition hover:border-border-ec-strong">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 flex-1 truncate text-sm text-text-ec">{d.claim}</p>
              <StatusBadge status={d.status} />
            </div>
            {deadline && <DeadlineCountdown deadline={deadline.value} label={deadline.label} compact />}
          </Link>
          );
        })}
      </div>

      <div className="mt-10">
        <Link href="/settings" className="text-sm text-cyan hover:underline">
          Manage wallet session settings →
        </Link>
      </div>
    </div>
  );
}
