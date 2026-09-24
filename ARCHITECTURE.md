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
Single contract, GenLayer StudioNet, GEN as stake token. Currently deployed
at `0x6F1CeE0a07953EC2EE18b4d9DE36aB010Abc10d2` (see `README.md` for the
live address, `CONTRACT_DEPLOYMENT.md` for redeploying, `docs/CONTRACT_SPEC.md`
for the full method/state spec). Built with the `genlayer-dev:write-contract`
skill, validated with `genvm-lint`, tested with both direct (mocked,
fast) and integration (real consensus) modes via `gltest`.

### 2. Backend (`backend/`) — Cloudflare Workers + D1

**Superseded 2026-09-23**: originally specified as Node/Fastify on Fly.io
with self-run Postgres. User instruction: "we are shifting the backend
from Fly to Cloudflare completely." Now: Cloudflare Workers (TypeScript)
for the API, Cloudflare D1 (SQLite-based, edge-replicated) for storage —
no Fly, no Postgres, no separately-hosted server process anywhere.

Responsibilities (unchanged in substance, only the runtime changed):
- **Never** weighs evidence or makes the verdict decision — read-only indexer over contract state plus auth/session plumbing. Every write (`create_dispute`, `accept_dispute`, `submit_evidence`, `submit_challenge_evidence`, `finalize_dispute`, `withdraw_credit`, ...) is a direct client-side transaction from the frontend, signed by the user's own wallet straight to the Intelligent Contract - the backend never sees or brokers a write.
- SIWE-style wallet auth (sign a server-issued nonce/challenge; connecting a wallet alone is never authentication). Nonces live in Workers KV (short TTL), sessions are JWT access/refresh tokens.
- D1 — indexed dispute/evidence/verdict history for fast reads, endpoint-abuse rate-limit counters, session storage. `GET /disputes` and `GET /disputes/:id` are **read-through**: they hit the contract live first and upsert into D1 as a cache side-effect, falling back to the D1 mirror only if the live read itself fails - a user never has to wait on the Cron Trigger to see their own just-submitted action reflected.
- A Cloudflare Workers Cron Trigger (every 2 minutes) additionally polls contract state via the GenLayer SDK and mirrors it into D1 as a background convenience; a manual `POST /internal/reindex` (protected by an `X-Internal-Secret` header) exists as an operational escape hatch if the cron ever falls behind. The contract remains the source of truth in all cases.
- Two separate rate limits, for two separate things: (1) endpoint-abuse limiting on backend routes is a D1-backed fixed-window counter keyed by client IP (`backend/src/middleware/rateLimit.ts`) - no Redis involved; (2) the GenLayer StudioNet RPC budget (this account is capped at 500 requests/hour by GenLayer) is tracked with Upstash Redis REST (`@upstash/redis/cloudflare`, atomic `INCR`), with D1 as a fallback counter if Redis is unavailable - see `backend/src/lib/genlayer-client.ts`'s `checkRpcBudget`. This budget only covers backend-side **reads**; wallet writes go straight from the browser to the chain and are subject to StudioNet's own RPC-level throttling instead, which the frontend retries with backoff (see the frontend section below).

**Why this is actually a better fit for the "must never die" requirement**:
Workers are edge/serverless — there is no long-lived process that can
crash and need an auto-restart the way a Fly machine can. Cloudflare's
network runs the Worker per-request across its edge; the 24/7 guarantee
comes from Cloudflare's platform SLA rather than from an app-level health
check/restart loop. D1 is Cloudflare-managed and edge-replicated, so there
is no separate database uptime story to manage either.

Trade-off to be explicit about: D1 is SQLite, not Postgres — the schema
(disputes, evidence_items, verdicts, users, social_connections, plus
auth/rate-limit tables) is designed to fit SQLite's simpler type system and
single-writer-per-shard model, which is a fine fit here since this backend
is a read-mostly index, never the source of truth for money movement.

### 3. Frontend (`frontend/`)
Next.js 16 (App Router, Turbopack), wagmi v2 + viem, Reown AppKit for
wallet connect (surfaces MetaMask, WalletConnect, and 80+ other wallets)
with a SIWE session layer on top. Uses `genlayer-js`'s own `studionet`
chain object (`genlayer-js/chains`), not a hand-rolled one - GenLayer-
specific chain fields (`consensusMainContract`,
`defaultConsensusMaxRotations`, etc.) are required internally when
encoding a write and a partial chain definition causes a silent
`undefined` → BigInt crash. The wallet's raw EIP-1193 provider
(`connector.getProvider()`) is used for the GenLayer client's transport,
not wagmi's wrapped viem client, since `genlayer-js` needs the raw
wire-compatible interface.

Pages: Landing, Dispute Creation, Evidence Submission (both parties),
Dispute Detail / Consensus Status (per-item assessments), Challenge
Submission, Verdict & Withdrawal Dashboard, Profile, Settings.

Visual system: "Lex Cryptographica" - a dark "Cryptographic
Institutionalism" palette (obsidian surfaces, electric cyan primary, amber
secondary, Hanken Grotesk + JetBrains Mono) implemented as CSS custom
properties in `frontend/app/globals.css`'s `@theme inline` block (Tailwind
v4, no `tailwind.config.js`). Token *names* (`--color-cyan`,
`--color-purple`, etc.) were kept stable across the redesign so existing
page/component markup didn't need renaming, only the underlying color
values changed.

Real transaction lifecycle tracking (`frontend/lib/tx.ts`) via the
GenLayer SDK's own receipt + `consensus_data` (submitted → accepted by
consensus → finalized), checking `leader_receipt.execution_result`
directly rather than a client-side timer or a string-matched RPC field - a
transaction can be ACCEPTED/FINALIZED with a failed execution, and that's
the actual signal to check. Writes retry with exponential backoff when
StudioNet's own RPC node throttles `eth_sendRawTransaction` under load,
surfacing a live retry notice instead of hanging or showing a raw error.

Deployed to Vercel at `crossbench-app.vercel.app` (canonical alias; old
per-deploy aliases are removed after each promote so this is the only
live URL).

### 4. Value-transfer path (real, not simulated)
Stake and settlement are actual GEN transfers on GenLayer StudioNet:
- Claimant sends GEN as `gl.message.value` on `create_dispute` (payable write).
- Respondent sends GEN as `gl.message.value` on `accept_dispute` (payable write, must equal the claimant's stake exactly).
- Settlement calls `_send_gen` (an `@gl.evm.contract_interface` emission stub) from the deterministic settlement function only — never from the nondeterministic validator path.
- Frontend tracks the real transaction lifecycle via the GenLayer SDK (submitted → accepted by consensus → executed → state updated), never a client-side timer or string-matched RPC field.

## Data model (Cloudflare D1 / SQLite — indexed mirror of contract state)

`disputes`, `evidence_items` (both original and additive-challenge items,
distinguished by an `is_challenge` flag - there's no separate challenges
table), `verdicts`, `rate_limit_counters` (endpoint abuse limiting),
`indexer_state` (cron watermark), plus `users`/`siwe_nonces`/`sessions`
(SIWE auth) and `social_connections` (OAuth-based, never raw username
entry — see below). All of it is a disposable cache: it can be fully
rebuilt from the contract at any time via `POST /internal/reindex` or the
next Cron Trigger tick, since the contract is the only source of truth for
anything involving stake or a verdict.

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
- Endpoint-abuse rate limiting on backend routes (D1-backed fixed-window counter, keyed by client IP) to blunt spam-dispute and bundle-flooding abuse. Separately, GenLayer RPC reads are budget-guarded via Upstash Redis (D1 fallback) to stay under StudioNet's own 500-requests/hour ceiling for this account - see the backend section above.
- No private keys ever touch the backend — wallet-based auth only, all signing happens client-side in the user's wallet.
- Secrets via `wrangler secret put` (backend) / Vercel env vars (frontend), never committed. Sessions are short-lived JWT access tokens (15 min) with a longer-lived refresh token, per `backend/src/routes/auth.ts`.

## Deployment

- Contract: Claude deploys directly via the `genlayer` CLI (`genlayer deploy contracts/crossbench_contract.py --network studionet`), per explicit user instruction ("deploy the address yourself") - this overrides the project's earlier default of the user deploying it themselves. Once deployed, the address is wired into the Worker's `CONTRACT_ADDRESS` secret and the frontend's `NEXT_PUBLIC_CONTRACT_ADDRESS` env var. See `CONTRACT_DEPLOYMENT.md` for the exact redeploy/rewire steps and the current live address.
- Backend + D1: Cloudflare, via `wrangler deploy`. `wrangler.toml` binds the D1 database, the `NONCES` KV namespace, and the Cron Trigger.
- Frontend: Vercel, via `vercel deploy --prod` followed by `vercel alias set <deployment-url> crossbench-app.vercel.app` to repoint the canonical alias (Vercel does not do this automatically on promote).

## Why not the other options

- Firebase/Supabase were available but a self-controlled relational schema was chosen for full control over the escrow/dispute schema and to avoid vendor lock-in on a financial-value application; that later became Cloudflare D1 specifically at the user's explicit instruction to move the entire backend off Fly onto Cloudflare.
- Wallet-based auth (not email+password+custodial wallet) was chosen to avoid the private-key-custody security surface entirely — the application never holds a key that can move user funds.
