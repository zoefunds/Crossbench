# CROSSBENCH — Architecture

## Core loop

```
DISPUTE + FALSIFIABLE CLAIM
        |
LOCKED STAKE (claimant on create, respondent on accept — counter-stake required)
        |
EVIDENCE SUBMISSION WINDOW (pinned bundles, max 3 items/side, web pages + on-chain refs only)
        |
INDEPENDENT VALIDATOR FETCH + PER-ITEM ASSESSMENT (nondeterministic, LLM + web access)
        |
EQUIVALENCE PRINCIPLE ON STRUCTURED AGGREGATE VERDICT (consensus)
        |
DETERMINISTIC STAKE DISTRIBUTION (pure function, separated from nondeterministic step)
        |
CHALLENGE WINDOW (48h fixed, additive evidence only, blocks withdrawal)
        |
FINALIZED PULL-BASED WITHDRAWAL
```

## Trust boundary

GenLayer validators make exactly one decision that matters: given two pinned
evidence bundles and a fixed, falsifiable claim, what does the evidence
actually show — PARTY_A, PARTY_B, or NEITHER/insufficient — per item, and
what does that aggregate to. Neither party's characterization of their own
evidence is trusted. A centralized backend never weighs evidence; it only
indexes what the contract has already decided. Removing GenLayer removes the
entire product: there is no other party positioned to independently fetch
and weigh both sides' evidence without an incentive to favor one side.

## System components

### 1. Intelligent Contract (`contracts/crossbench_contract.py`)
Single contract, GenLayer Studio/StudioNet, GEN as stake token. See
`docs/CONTRACT_SPEC.md` for full method/state spec. Built with the
`genlayer-dev:write-contract` skill, validated with `genvm-lint`.

### 2. Backend (`backend/`) — Cloudflare Workers + D1

**Superseded 2026-09-23**: originally specified as Node/Fastify on Fly.io
with self-run Postgres. User instruction: "we are shifting the backend
from Fly to Cloudflare completely." Now: Cloudflare Workers (TypeScript)
for the API, Cloudflare D1 (SQLite-based, edge-replicated) for storage —
no Fly, no Postgres, no separately-hosted server process anywhere.

Responsibilities (unchanged in substance, only the runtime changed):
- **Never** weighs evidence or makes the verdict decision — read-only indexer over contract events/state plus auth/session plumbing.
- SIWE-style wallet auth (sign a server-issued nonce/challenge; connecting a wallet alone is never authentication). Nonces and sessions stored in D1 (or Workers KV for short-lived nonces) rather than Redis.
- D1 — indexed dispute/evidence/verdict history for fast reads, rate-limit counters, session storage.
- Cloudflare Workers Cron Triggers poll contract state via the GenLayer SDK on a schedule and mirror it into D1; the contract remains the source of truth — the UI can always fall back to a direct contract read.
- Rate limiting via Cloudflare's native rate-limiting rules / a Durable Object counter, replacing the earlier Redis-based plan.

**Why this is actually a better fit for the "must never die" requirement**:
Workers are edge/serverless — there is no long-lived process that can
crash and need an auto-restart the way a Fly machine can. Cloudflare's
network runs the Worker per-request across its edge; the 24/7 guarantee
comes from Cloudflare's platform SLA rather than from an app-level health
check/restart loop. D1 is Cloudflare-managed and edge-replicated, so there
is no separate database uptime story to manage either.

Trade-off to be explicit about: D1 is SQLite, not Postgres — the schema
(disputes, evidence_items, verdicts, challenges, users, social_connections)
is designed to fit SQLite's simpler type system and single-writer-per-shard
model, which is a fine fit here since this backend is a read-mostly index,
never the source of truth for money movement.

### 3. Frontend (`frontend/`)
Next.js. Wallet connect (MetaMask/Rainbow/Zerion) via a wallet-kit library
with SIWE. Pages: Landing, Dispute Creation, Evidence Submission (both
parties), Dispute Detail / Consensus Status (per-item assessments), Challenge
Submission, Verdict & Withdrawal Dashboard, History, Profile, Settings.
Visual system: `~/Downloads/DESIGN.md` tokens (dark "Technological
Elegance" palette), dashboard/escrow/transactions HTML files as layout
reference — reinterpreted for Crossbench's actual flows, not copied.
Deployed to Vercel.

### 4. Value-transfer path (real, not simulated)
Stake and settlement are actual GEN transfers on GenLayer StudioNet:
- Claimant sends GEN as `gl.message.value` on `create_dispute` (payable write).
- Respondent sends GEN as `gl.message.value` on `accept_dispute` (payable write, must equal the claimant's stake exactly).
- Settlement calls `_send_gen` (an `@gl.evm.contract_interface` emission stub) from the deterministic settlement function only — never from the nondeterministic validator path.
- Frontend tracks the real transaction lifecycle via the GenLayer SDK (submitted → accepted by consensus → executed → state updated), never a client-side timer or string-matched RPC field.

## Data model (Postgres — indexed mirror of contract state)

`disputes`, `evidence_items`, `verdicts`, `challenges`, `users` (wallet
address, SIWE session), `social_connections` (OAuth-based, never raw
username entry — see below).

## Social connections

Per user instruction: platform-account linking for the moderation-appeal
reference scenario (e.g. "this is my account on Platform X") must go
through an OAuth-style connection flow, never a free-text username field —
free-text usernames let anyone claim someone else's account. v1 ships with
the connection abstraction in place; concrete OAuth providers are wired in
as a follow-up once the core dispute loop is proven (matches the "launch
narrow, generalize after" decision).

## Security posture

- SSRF protection on the contract's evidence fetch (allow-list URL schemes, reject internal/private IP ranges, size caps).
- XSS: all evidence content rendered as text/sanitized in the frontend, never `dangerouslySetInnerHTML` on fetched content.
- Rate limiting on dispute/evidence-submission endpoints (Redis) to blunt spam-dispute and bundle-flooding abuse.
- No private keys ever touch the backend — wallet-based auth only, all signing happens client-side in the user's wallet.
- Secrets via Fly secrets / Vercel env vars, never committed.

## Deployment

- Contract: user deploys via GenLayer Studio/CLI to StudioNet. Claude does not deploy it. Once deployed, the address is supplied and wired into the Worker's environment bindings and `frontend/.env`.
- Backend + D1: Cloudflare, via `wrangler deploy`. `wrangler.toml` binds the D1 database and any KV/Durable Object namespaces.
- Frontend: Vercel.

## Why not the other options

- Firebase/Supabase were available but a self-controlled relational schema was chosen for full control over the escrow/dispute schema and to avoid vendor lock-in on a financial-value application; that later became Cloudflare D1 specifically at the user's explicit instruction to move the entire backend off Fly onto Cloudflare.
- Wallet-based auth (not email+password+custodial wallet) was chosen to avoid the private-key-custody security surface entirely — the application never holds a key that can move user funds.
