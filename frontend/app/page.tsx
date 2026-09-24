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
    <div className="w-full">
      <section className="relative overflow-hidden border-b border-border-ec px-6 py-20 md:py-28">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[900px] -translate-x-1/2 rounded-full bg-cyan/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 right-0 h-72 w-72 rounded-full bg-purple/10 blur-[110px]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <span className="label-sm inline-flex items-center gap-2 rounded-full border border-border-ec bg-card px-3 py-1.5 text-cyan">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
            Built on GenLayer Intelligent Contracts · StudioNet
          </span>
          <h1 className="mt-6 font-headline text-5xl font-bold tracking-tight text-text-ec md:text-6xl">
            Both sides submit their proof.
            <br />
            <span className="text-cyan">Neither side gets to weigh it.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-dim">
            Crossbench is a general-purpose dispute protocol. Two adversarial parties each stake GEN and
            submit a bundle of precommitted public evidence for a specific claim. GenLayer validators - not
            either party, not a moderator, not the platform - independently fetch and weigh that evidence to
            reach a verdict.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/disputes/new"
              className="rounded px-6 py-3 font-headline font-semibold text-navy bg-cyan shadow-[0_0_24px_rgba(76,215,246,0.25)] transition hover:brightness-110"
            >
              Open a Dispute
            </Link>
            <Link
              href="/disputes"
              className="rounded border border-border-ec-strong px-6 py-3 font-headline font-semibold text-text-ec transition hover:border-cyan hover:text-cyan"
            >
              Browse Disputes
            </Link>
          </div>
          <div className="mx-auto mt-14 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-xl border border-border-ec bg-card/60 px-6 py-4">
            {["Zero centralized mediators", "Pinned immutable bundles", "Symmetric treatment", "Additive-only challenges"].map((item) => (
              <span key={item} className="label-sm flex items-center gap-1.5 text-text-dim">
                <span className="h-1 w-1 rounded-full bg-cyan" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10">
          <p className="label-sm text-cyan">Protocol mechanism</p>
          <h2 className="mt-2 font-headline text-3xl font-semibold text-text-ec">The Core Loop</h2>
        </div>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {STAGES.map((stage, i) => (
            <li key={stage.label} className="glass-card p-5 transition-colors hover:border-border-ec-strong">
              <div className="flex items-baseline gap-3">
                <span className="data-mono text-sm font-semibold text-purple">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-headline font-semibold text-text-ec">{stage.label}</h3>
              </div>
              <p className="mt-2 text-sm text-text-dim">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="glass-card-ai p-8">
          <p className="label-sm mb-3 text-cyan">Reference scenario</p>
          <h2 className="font-headline text-2xl font-semibold text-text-ec">Platform moderation appeals</h2>
          <p className="mt-3 max-w-2xl text-text-dim">
            A platform actions a user&apos;s content for allegedly violating a specific, publicly-posted policy
            provision. The user opens a dispute, stakes GEN, and submits evidence. If the platform opts in, it
            counter-stakes and submits its own evidence. Validators independently determine whether the
            evidence supports a genuine violation - the same claim format also supports delivery disputes,
            listing-accuracy disputes, and other two-party factual disputes.
          </p>
        </div>
      </section>
    </div>
  );
}
