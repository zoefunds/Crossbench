import Link from "next/link";

const STAGES = [
  { label: "Dispute + Falsifiable Claim", detail: "A specific, falsifiable claim is stated and pinned at creation." },
  { label: "Locked Stake", detail: "Both parties stake GEN - the respondent must counter-stake exactly to proceed." },
  { label: "Evidence Submission", detail: "Each side pins up to three evidence items: web pages or on-chain references." },
  { label: "Independent Validator Assessment", detail: "GenLayer validators fetch and assess every item themselves, from both sides." },
  { label: "Structured Verdict", detail: "A per-item, per-side aggregate verdict via the Equivalence Principle." },
  { label: "Deterministic Settlement", detail: "A separate, deterministic function distributes the stake from the verdict." },
  { label: "Challenge Window", detail: "Either side may add - never replace - evidence before funds unlock." },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <section className="mb-24">
        <p className="label-sm mb-4 text-cyan">Stake-backed dispute resolution</p>
        <h1 className="font-headline text-5xl font-bold tracking-tight text-text-ec md:text-6xl">
          Both sides submit their proof.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan to-purple">
            Neither side gets to weigh it.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-text-dim">
          Crossbench is a general-purpose dispute protocol. Two adversarial parties each stake GEN and
          submit a bundle of precommitted public evidence for a specific claim. GenLayer validators - not
          either party, not a moderator, not the platform - independently fetch and weigh that evidence to
          reach a verdict.
        </p>
        <div className="mt-8 flex gap-4">
          <Link href="/disputes/new" className="rounded px-6 py-3 font-semibold text-navy bg-cyan transition hover:brightness-110">
            Open a Dispute
          </Link>
          <Link href="/disputes" className="rounded border border-border-ec-strong px-6 py-3 font-semibold text-text-ec transition hover:border-cyan">
            Browse Disputes
          </Link>
        </div>
      </section>

      <section>
        <h2 className="label-sm mb-6 text-text-dim">The Core Loop</h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {STAGES.map((stage, i) => (
            <li key={stage.label} className="glass-card p-5">
              <div className="flex items-baseline gap-3">
                <span className="data-mono text-sm text-purple">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-headline font-semibold text-text-ec">{stage.label}</h3>
              </div>
              <p className="mt-2 text-sm text-text-dim">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24 glass-card-ai p-8">
        <p className="label-sm mb-3 text-purple">Reference scenario</p>
        <h2 className="font-headline text-2xl font-semibold text-text-ec">Platform moderation appeals</h2>
        <p className="mt-3 max-w-2xl text-text-dim">
          A platform actions a user&apos;s content for allegedly violating a specific, publicly-posted policy
          provision. The user opens a dispute, stakes GEN, and submits evidence. If the platform opts in, it
          counter-stakes and submits its own evidence. Validators independently determine whether the
          evidence supports a genuine violation - the same claim format also supports delivery disputes,
          listing-accuracy disputes, and other two-party factual disputes.
        </p>
      </section>
    </div>
  );
}
