import Link from "next/link";
import { fetchDisputes } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";

function activeDeadline(dispute: Awaited<ReturnType<typeof fetchDisputes>>["items"][number]) {
  if (dispute.status === "CREATED") return { value: dispute.response_deadline, label: "Response closes in" };
  if (dispute.status === "EVIDENCE_SUBMISSION" && dispute.evidence_deadline) return { value: dispute.evidence_deadline, label: "Evidence closes in" };
  if (dispute.status === "PRELIMINARY_VERDICT" && dispute.challenge_deadline) return { value: dispute.challenge_deadline, label: "Challenge closes in" };
  return null;
}

function formatStake(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

export default async function DisputesPage() {
  let disputes: Awaited<ReturnType<typeof fetchDisputes>>["items"] = [];
  let loadError: string | null = null;
  try {
    ({ items: disputes } = await fetchDisputes({ limit: 50, fresh: true }));
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-headline text-3xl font-bold text-text-ec">Disputes</h1>
        <Link href="/disputes/new" className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan transition hover:brightness-110">
          Open a Dispute
        </Link>
      </div>

      {loadError && (
        <div className="glass-card border-error/40 p-5 text-error">Could not load disputes: {loadError}</div>
      )}

      {!loadError && disputes.length === 0 && (
        <div className="glass-card p-10 text-center text-text-dim">No disputes yet. Be the first to open one.</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {disputes.map((dispute) => {
          const deadline = activeDeadline(dispute);
          return (
          <Link key={dispute.id} href={`/disputes/${dispute.id}`} className="glass-card block min-w-0 p-5 transition hover:border-border-ec-strong">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="label-sm mb-1 text-text-dim">{dispute.claim_category.replaceAll("_", " ")}</p>
                <p className="truncate text-text-ec">{dispute.claim}</p>
              </div>
              <StatusBadge status={dispute.status} />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-text-dim">
              <span className="data-mono">{dispute.id}</span>
              <span className="data-mono">{formatStake(dispute.stake_wei)} GEN staked</span>
            </div>
            {deadline && <DeadlineCountdown deadline={deadline.value} label={deadline.label} compact />}
          </Link>
          );
        })}
      </div>
    </div>
  );
}
