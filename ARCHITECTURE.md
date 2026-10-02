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
at `0xE8820FB49D6b2e5984Bc8F70762bbB659FbA221c` (see `README.md` for the
live address, `CONTRACT_DEPLOYMENT.md` for redeploying, `docs/CONTRACT_SPEC.md`
for the full method/state spec). Built with the `genlayer-dev:write-contract`
skill, validated with `genvm-lint`, tested with both direct (mocked,
fast) and integration (real consensus) modes via `gltest`.

### 2. Backend (`backend/`) — Fly.io Node/Hono + PostgreSQL

The backend runs as a Node/Hono service on Fly.io. PostgreSQL stores the
indexed contract mirror, sessions, rate-limit counters, and expiring nonce /
OAuth state records. The contract remains the source of truth for money and
verdict decisions.

Responsibilities (unchanged in substance, only the runtime changed):
- **Never** weighs evidence or makes the verdict decision — read-only indexer over contract state plus auth/session plumbing. Every write (`create_dispute`, `accept_dispute`, `submit_evidence`, `submit_challenge_evidence`, `finalize_dispute`, `withdraw_credit`, ...) is a direct client-side transaction from the frontend, signed by the user's own wallet straight to the Intelligent Contract - the backend never sees or brokers a write.
- SIWE-style wallet auth (sign a server-issued nonce/challenge; connecting a wallet alone is never authentication). Nonces and OAuth state live in PostgreSQL with expiry timestamps; sessions are JWT access/refresh tokens.
- PostgreSQL stores indexed dispute/evidence/verdict history, endpoint-abuse rate-limit counters, and session data. `GET /disputes` and `GET /disputes/:id` are read-through and fall back to the indexed mirror if the live read fails.
- A process scheduler polls contract state every two minutes. A manual `POST /internal/reindex` protected by `X-Internal-Secret` remains available as an operational escape hatch.
- The GenLayer StudioNet RPC budget is tracked with Upstash Redis when configured, with PostgreSQL as a fallback. This budget covers backend-side reads only; wallet writes go directly from the browser to the contract.

Fly is configured with a permanently running machine, HTTPS, health checks,
and automatic machine restart behavior. PostgreSQL is external to the app
machine so application restarts do not affect persisted data.

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

## Data model (PostgreSQL — indexed mirror of contract state)

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
- Endpoint-abuse rate limiting on backend routes (PostgreSQL-backed fixed-window counter, keyed by client IP) to blunt spam-dispute and bundle-flooding abuse. Separately, GenLayer RPC reads are budget-guarded via Upstash Redis (PostgreSQL fallback).
- No private keys ever touch the backend — wallet-based auth only, all signing happens client-side in the user's wallet.
- Secrets via Fly secrets (backend) / Vercel env vars (frontend), never committed. Sessions are short-lived JWT access tokens (15 min) with a longer-lived refresh token.

## Deployment

- Contract: Claude deploys directly via the `genlayer` CLI (`genlayer deploy contracts/crossbench_contract.py --network studionet`), per explicit user instruction ("deploy the address yourself") - this overrides the project's earlier default of the user deploying it themselves. Once deployed, the address is wired into the Worker's `CONTRACT_ADDRESS` secret and the frontend's `NEXT_PUBLIC_CONTRACT_ADDRESS` env var. See `CONTRACT_DEPLOYMENT.md` for the exact redeploy/rewire steps and the current live address.
- Backend + PostgreSQL: Fly.io, via `fly deploy`; see `backend/fly.toml` and `backend/FLY_MIGRATION.md`.
- Frontend: Vercel, via `vercel deploy --prod` followed by `vercel alias set <deployment-url> crossbench-app.vercel.app` to repoint the canonical alias (Vercel does not do this automatically on promote).

## Why not the other options

- Firebase/Supabase were available but a self-controlled relational schema was chosen for full control over the escrow/dispute schema and to avoid vendor lock-in on a financial-value application.
- Wallet-based auth (not email+password+custodial wallet) was chosen to avoid the private-key-custody security surface entirely — the application never holds a key that can move user funds.
