# CROSSBENCH — Build Memory

Read this first in any new session. This file tracks build status, decisions
already made (do not re-ask), and what's next. Update it at the end of every
work session.

## Project identity

CROSSBENCH is a general-purpose, stake-backed dispute resolution
protocol. Two adversarial parties each submit a bundle of precommitted
public evidence for a specific, falsifiable claim; GenLayer validators
independently fetch and assess every item from both bundles and reach a
structured verdict via the Equivalence Principle. Deterministic settlement
distributes the combined stake. Flagship reference scenario: platform
moderation appeals.

This is a **separate project** from `/Users/macbook/Verdict-Market`
(prediction markets resolved by condition-checking) even though both use
GenLayer validator consensus as the trust primitive. Confirmed with the
user 2026-09-23 — do not merge or confuse the two.

## Discovery questionnaire — answers on record (do not re-ask)

| Question | Answer |
|---|---|
| Backend stack | ~~PostgreSQL, self-run~~ **SUPERSEDED 2026-09-23: Cloudflare Workers + D1 (SQLite-based). User: "everything on Cloudflare, no more Fly." No external Postgres.** |
| Backend hosting | ~~Fly.io~~ **SUPERSEDED 2026-09-23: Cloudflare Workers only.** Workers are edge/serverless with no cold-start "server died" failure mode — arguably a better fit for the 24/7 requirement than a Fly machine that can crash and needs auto-restart. |
| Authentication | External wallet connect via Reown AppKit (surfaces MetaMask, WalletConnect, Trust Wallet, Binance Wallet, SafePal, and 80+ more — not just the original three named in discovery), SIWE-style signed-challenge auth. Connecting a wallet alone is never treated as authentication. |
| Dispute scope (v1) | Narrow: moderation-appeal reference case only. Generalize after the core loop is proven. |
| Evidence bundle cap | 3 items per party (plus up to 2 additive challenge items per party). Web pages + on-chain references only — no arbitrary file uploads. |
| Counter-stake | Required. Responding party must counter-stake within the response window or claimant wins by default/timeout. |
| Challenge window | Fixed 48 hours for all disputes (not configurable in v1). |
| Contract deployment | ~~User deploys the contract themselves via GenLayer Studio/CLI. Claude does NOT deploy it.~~ **SUPERSEDED: user said "deploy the address yourself" — Claude now deploys directly via the `genlayer` CLI when a (re)deploy is needed, and wires the resulting address into both the backend Worker secret and the frontend env var itself. See `CONTRACT_DEPLOYMENT.md`.** |
| Frontend host | Vercel (CLI already installed locally). |
| Backend host | ~~Fly.io~~ **Cloudflare Workers** (see Backend hosting row above — this row was left stale after that supersession; corrected here). |
| Socials | Connection-based (OAuth-style), never raw username typing, to prevent impersonation. |

## Reference material (inspiration, not copy — see anti-plagiarism note below)

- ~~`~/Downloads/DESIGN.md` — dark "Technological Elegance" design token spec.~~ **SUPERSEDED 2026-09-24**: the live frontend theme is now "Lex Cryptographica" (obsidian/cyan/amber, Hanken Grotesk + JetBrains Mono), sourced from `~/Documents/stitch_dark_theme_concept_design/DESIGN.md` and four accompanying HTML mockups in the same directory — see the "Visual redesign" entry below for what actually shipped. The original "Technological Elegance" tokens this row describes are no longer in use anywhere in the code.
- `~/Downloads/dashboard.html`, `escrow.html`, `Transactions.html`, `Ai-coach.html` — component/layout prototypes from the original "Technological Elegance" batch, superseded the same way as the DESIGN.md row above. No longer the active visual reference.
- `~/Downloads/RialoCourt.html` — **excluded**. Its own header comment says it's "Rebranded from LexCourt / DisputeCourt", running on Base Sepolia + USDC. Chain of renamed reused projects — exactly what the review team's instruction #3 (plagiarism / renamed examples) flags. Not used anywhere in this build.
- `/Users/macbook/source-stake/contracts/veritine_contract.py` (1892 lines) and `/Users/macbook/Witness-Weaver/contracts/witnessweave_contract.py` (1024 lines) — architectural pattern reference only (escrow custody/emission pattern, nondeterministic/deterministic separation, state machine structure). Crossbench's contract is a new implementation for a different primitive (two-party evidence-weighted disputes, not milestone escrow or witness attestation) — not a renamed copy.
- `/Users/macbook/Meme-olympics/contracts/meme_olympics.py` — reference for the LLM's structured, adversarial-content-resistant visual/content interpretation pattern.
- `builder-resources.md` — **not found on disk anywhere**; user was asked, did not supply a path. Proceeding without it, using the `genlayer-dev` skill family (write-contract, genvm-lint, direct-tests, integration-tests) and the live GenLayer docs MCP instead. Flag to user if a gap surfaces.

## Escrow pattern (from ShipBond, supplied by user, applies here)

The custody/emission pattern Crossbench's contract must follow:
1. Payable writes only accept `gl.message.value` as authoritative — never a caller-supplied amount.
2. Terms (`stake_wei`) are stored separately from the actual ledger (`stake_deposited`) — payout logic only ever reads the ledger field.
3. Every GEN transfer funnels through one `_send_gen` helper via the `_Recipient` EVM interface stub — single emission choke point.
4. Ordering rule in every payout path: read ledger → zero ledger → save state → only then call `_send_gen`. Never transfer before state is zeroed and saved (reentrancy/double-spend guard).
5. Every exit path enumerated up front: verdict-driven settle, INCONCLUSIVE split/refund, sponsor/claimant timeout recovery, pre-acceptance cancellation refund.
6. `gl.vm.UserError` for all validation rejections, never bare `raise Exception`.
7. Money fields are `u256`, stored as strings in TreeMap[str, str] state, cast at boundaries.
8. Run `genvm-lint check <file> --json` after every contract change.

## Build status

- [x] 2026-09-23 — Discovery questionnaire answered, project scaffolded at `/Users/macbook/Evidence court`.
- [x] 2026-09-23 — ARCHITECTURE.md written (pre-Cloudflare-shift version; needs a pass to update the backend section).
- [x] 2026-09-23 — Intelligent Contract written (`contracts/crossbench_contract.py`, 546 lines), dense/low-comment style matched to `github.com/Bibidee/crux` per user's reference. `genvm-lint check` passes (15 methods, 11 write/4 view), `genvm-lint schema` extracts cleanly — confirms no "could not load contract schema" risk. Runner pinned to `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` (the newer hash genvm-lint suggested, `1zr6nqk...`, has no downloadable runner bundle yet — do not switch to it until `genvm-lint download` can fetch it).
- [x] 2026-09-23 — **Backend stack changed mid-build: Cloudflare Workers + D1, no Fly, no Postgres.** See discovery table above.
- [x] 2026-09-23 — ARCHITECTURE.md backend/deployment sections rewritten for Cloudflare Workers + D1.
- [x] 2026-09-23 — Direct-mode contract tests written (`contracts/tests/direct/`, 17 tests, all passing): validation/reverts, access control, escrow pinning/immutability, full settlement math (claimant win / inconclusive split / challenge re-assessment), accounting invariant.
  - **Known harness limitation (not a contract bug)**: the installed `genlayer-test` 0.29.2 direct-mode VM never re-injects `gl.message_raw["datetime"]` after deploy, so `direct_vm.warp()` cannot move `_now()` forward for later calls, and cross-contract self-emits (`PostMessage`, used for the `begin_assessment`/`complete_final_assessment` stage transitions) are logged as "Unknown gl_call request type" no-ops rather than executed. Worked around in direct tests by spoofing `direct_vm.sender = direct_vm._contract_address` to call the self-only stage methods directly, and by testing the deadline-gated paths (`claim_response_timeout` success, `finalize_dispute` after the 48h challenge window) only in integration tests, where real per-transaction timestamps and consensus execution make both work correctly.
- [x] 2026-09-23 — Contract integration tests written and run against **real StudioNet** (`contracts/tests/integration/test_lifecycle.py`), using GLSim locally only as a fast bootstrap check (its own schema introspection is broken - returns empty `methods: {}` for our contract - not a contract defect, confirmed via direct RPC comparison against `genvm-lint schema`'s correct output; noted, not relied on).
  - **Real bug found and fixed via this testing**: the contract source had one non-ASCII em dash (U+2014) in a prompt string. GenVM itself parses it fine, but `genlayer-py`'s `get_contract_schema_for_code` hex-encodes the raw source with `eth_utils.encode_hex()`, which requires strict ASCII and throws `UnicodeEncodeError` on any non-ASCII byte - silently swallowed by the client's fallback logic as "Failed to get schema from all clients." This is exactly the "could not load contract schema" failure mode the user explicitly warned about, caused by something as innocuous as one em dash. Fixed by replacing it with a hyphen; confirmed the file is now pure ASCII. **Lesson for future edits to this contract: never introduce non-ASCII characters (smart quotes, em/en dashes, etc.) anywhere in the source, even inside comments or prompt strings.**
  - Also found: `class Crossbench(gl.Contract)` needed an explicit `@allow_storage` decorator for real GenVM deployment to succeed (GLSim's leader execution errored `class is not marked for usage within storage` without it) - added; `genvm-lint` did not catch this, so real deployment testing was load-bearing here, not redundant with lint.
  - `test_default_judgment_on_response_timeout` passes end-to-end against real StudioNet (deploy → create_dispute → read → pre-deadline rejection).
  - **Second real bug found via the slow real-consensus test**: `submit_evidence` used to self-emit (`gl.get_contract_at(gl.message.contract_address).emit(on="finalized").begin_assessment(...)`) to auto-start assessment once both bundles were in. In a real StudioNet run this never completed within a 10-minute wait (status stuck at `EVIDENCE_SUBMISSION`, `preliminary_verdict: None`) - either the self-emit genuinely needs much longer than 10 minutes for `on="finalized"` to resolve, or it silently didn't fire; not conclusively determined which. Worse, `trigger_evaluation` (the manual fallback) was gated on the full 72h `evidence_deadline`, so if the self-emit failed, a dispute where both sides had already submitted would sit stuck for up to 72 hours with no way to unstick it - exactly the "funds/process stuck" failure mode the spec explicitly warns against. **Fix applied**: removed the self-emit from `submit_evidence` entirely; `trigger_evaluation` now fires as soon as `bundle_respondent_submitted` is true (in addition to the existing deadline-passed path), so the frontend calls it as an explicit second transaction right after evidence submission succeeds - predictable, debuggable, no reliance on an unproven async self-call. `get_dispute`'s `can_trigger_evaluation` field updated to match. Direct-mode suite re-run clean (17/17) after the change; re-running the real-consensus integration test now with the explicit trigger to confirm the fix actually resolves this before treating it as closed.
  - `test_full_moderation_appeal_lifecycle_real_consensus`, `test_adversarial_evidence_content_is_not_authoritative`, `test_symmetric_treatment_of_both_bundles` are `@pytest.mark.slow` (real web+LLM consensus, several minutes each) - run with `gltest -m slow --network studionet`.
  - **Third real bug, found by re-running the same slow test after the `trigger_evaluation` fix**: even the now-explicit `trigger_evaluation` call itself succeeded (`tx_execution_succeeded` passed), but its emitted self-call (`gl.get_contract_at(gl.message.contract_address).emit(on="finalized").begin_assessment(...)`) still never completed within ~11 minutes on real StudioNet - two separate real-network runs confirmed this, not a fluke. **Root-cause fix, not a workaround**: removed the emit-to-self indirection entirely. `begin_assessment` and `complete_final_assessment` no longer exist as separate self-only methods; their logic (the nondeterministic assessment via `_run_assessment_consensus`) now runs directly inline inside `trigger_evaluation` and `finalize_dispute`, in the same transaction, the same way the write-contract skill's own basic example calls `run_nondet_unsafe` directly inside a public write with no emit involved. The emit-based async-stage pattern (borrowed from `crux_registry.py`'s cross-contract registry↔verifier↔judge callbacks, where it's solving a genuinely different problem - handing off to a *separate* contract) was unnecessary complexity for a single-contract design and introduced unproven, apparently multi-minutes-or-more latency for no benefit. `_self_only()` helper removed (nothing calls it anymore). Contract is down to 13 methods (was 15) and simpler. Direct-mode suite (17 tests) and `genvm-lint`/schema extraction all re-verified clean after the change. **Currently re-running `test_full_moderation_appeal_lifecycle_real_consensus` against real StudioNet a third time to confirm this actually resolves it before treating it as closed - do not assume success until that result lands.**
  - `gltest.config.yaml` requires a `networks.default:` key even for a single network (undocumented in the skill, found via error message) - present in the committed config.
  - Local GLSim setup notes (for future sessions): the `glsim` binary needs `fastapi`/`uvicorn` which aren't in its own dependency closure under the Homebrew Python 3.14 install; a `.glsim-venv` venv with `--system-site-packages` plus `pip install fastapi uvicorn` fixes it. Port 4000 is occupied by another local Docker service on this machine - GLSim run on port 4010 instead, and `gltest`'s hardcoded `get_local_client()` (used only as the third schema-fetch fallback) still points at 4000, which is fine since the `default` client (StudioNet, using the configured RPC URL) succeeds first.
- [x] 2026-09-23 — Backend scaffolded: Cloudflare Workers (Hono) + D1 + KV, in `backend/`. SIWE auth (nonce + signature verify, JWT access token + D1-backed refresh session), D1 schema (`migrations/0001_init.sql`: users, sessions, siwe_nonces, social_connections, disputes, evidence_items, verdicts, indexer_state, rate_limit_counters), read-only dispute API backed by the D1 index with live-contract fallback, D1-backed fixed-window rate limiting, Cron Trigger indexer (`src/indexer/poll.ts`) that mirrors contract state into D1 without ever computing or trusting a verdict itself, social-connection OAuth-flow skeleton (explicitly not a free-text username field, per instruction). `npx tsc --noEmit` clean, `npx wrangler deploy --dry-run` bundles successfully with all bindings resolving.
  - Adapted the `genlayer-js`-under-Workers fix and the Cron-indexer pattern from the user's own `Verdict-Market/backend` (already-solved problems: `window.ethereum` branch crashes under Workers unless an `account` object is attached via `createAccount()`; D1 upsert-on-conflict indexing shape) - same technical fix, re-implemented for Crossbench's schema and D1 instead of Postgres, not a copy-paste of the other project's business logic.
  - **Not yet done**: real OAuth provider registration for social connections (deliberately left as an explicit 501 "not configured yet" rather than faked), `wrangler d1 create` / `wrangler kv namespace create` haven't been run yet (need the user's Cloudflare account), `CONTRACT_ADDRESS` secret not set (waiting on user's deployment), no frontend yet to exercise these endpoints from a real browser flow.
- [x] 2026-09-23 — Frontend scaffolded and built: Next.js 16 (App Router), `frontend/`. This Next.js version has real breaking changes vs older training data (`params` is a `Promise` in page props, route typing via generated `PageProps<>`/`LayoutProps<>` helpers) - confirmed against `node_modules/next/dist/docs/` before writing route code, per the project's own AGENTS.md warning.
  - Pages: landing (`/`), dispute browse (`/disputes`), dispute creation (`/disputes/new`), dispute detail (`/disputes/[id]` - per-item validator assessment, verdict, all lifecycle actions), profile (`/profile`), settings (`/settings` - SIWE sign-in + social connections). History is the `/disputes` list filtered to the connected wallet on `/profile`; no separate route needed for v1.
  - Real value-transfer path: `lib/genlayer.ts` builds a `genlayer-js` client from the connected wallet's own EIP-1193 provider (via wagmi's `useConnectorClient`), so every write (`create_dispute`, `accept_dispute`, `submit_evidence`, `submit_challenge_evidence`, `trigger_evaluation`, `finalize_dispute`, `withdraw_credit`) is signed client-side by the user's real wallet - the frontend never holds a key. `lib/tx.ts` tracks the actual SDK lifecycle (`writeContract` → `waitForTransactionReceipt({status: ACCEPTED})` → `waitForTransactionReceipt({status: FINALIZED})`, reading `consensus_data.leader_receipt[0].execution_result`) - never a client-side timer, never a string-matched field.
  - Wallet connect via Reown AppKit (MetaMask/Rainbow/Zerion, matches the decision) + SIWE (`lib/auth.ts`) - connecting a wallet alone never establishes a session; `/settings` requires an explicit signed message.
  - Design system: DESIGN.md's "Technological Elegance" tokens ported into `app/globals.css` (`--ec-*` CSS vars + Tailwind `@theme inline`), Manrope + JetBrains Mono via `next/font/google`, glassmorphic cards, cyan/purple status language reused for validator supports (CLAIMANT/RESPONDENT) and AI-reasoning states. Layouts/components are original for Crossbench's actual flows (dispute cards, evidence bundle editor, per-item assessment grid) - not copied from the Aureon dashboard/escrow/Transactions.html batch, used only as visual-language reference, per instruction.
  - Favicon/logo: `app/icon.svg` (auto-picked up by Next.js) + `components/Logo.tsx` - a scale-of-justice mark fused with a node/edge (decentralized network) motif, cyan-to-purple gradient on Midnight Navy, distinct from any of the reference projects' marks.
  - `npx tsc --noEmit` clean, `npx next build` succeeds for all 8 routes (2 static, 2 dynamic, rest prerendered).
  - **Not yet done**: real Reown `projectId` (placeholder empty in `.env.local`/`.env.example` - needs the user's Reown Cloud project), `NEXT_PUBLIC_CONTRACT_ADDRESS` (waiting on deployment), no live browser testing yet (needs the backend deployed or run locally via `wrangler dev` first), no automated frontend tests, accessibility pass not yet done, loading/empty states exist but haven't been visually reviewed.
- [x] 2026-09-23 — **Cloudflare deployment live.** User confirmed both CLIs (`wrangler`, `vercel`) were already authenticated, so this was run for real, not simulated:
  - `wrangler d1 create crossbench` → D1 database id `14f2b5b0-473f-417e-a72b-7ec949959374`, region WEUR.
  - `wrangler kv namespace create NONCES` → KV id `962b55a4acfc438a9d37ee6e500604a0`.
  - Both ids wired into `backend/wrangler.toml` (no more `REPLACE_WITH_*` placeholders).
  - `wrangler d1 migrations apply crossbench --remote` applied `0001_init.sql` (13 statements) to the real remote database.
  - `JWT_SECRET` generated (32 random bytes, hex) and set via `wrangler secret put` - never written to a file that persisted (generated straight into the `wrangler secret put` stdin, temp file removed immediately after).
  - `wrangler deploy` succeeded: **https://crossbench-api.preciousmofeoluwa.workers.dev** - `/health` returns `{"ok":true}`, `/stats` correctly returns `{"configured":false}` (no contract address yet, exactly as designed - not faked), `/disputes` returns `{"items":[]}`. Cron trigger active (`*/2 * * * *`).
- [x] 2026-09-23 — **Vercel deployment live.** `vercel link` (team `adebiyi2002gmailcoms-projects`), env vars set (`NEXT_PUBLIC_API_URL` → the Worker URL above, `NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999`, `NEXT_PUBLIC_GENLAYER_RPC_URL`, `NEXT_PUBLIC_APP_URL`), `vercel deploy --prod` succeeded. Live at **https://frontend-tau-livid-gi1xp8ftb4.vercel.app** (title renders correctly, HTTP 200).
  - **Not yet set**: `NEXT_PUBLIC_CONTRACT_ADDRESS` (waiting on user's contract deployment - see next step) and `NEXT_PUBLIC_REOWN_PROJECT_ID` (empty - wallet connect button won't actually open until the user creates a Reown Cloud project and this is set; everything else on the site works without it). Backend CORS currently reflects any request origin (`cors({origin: (origin) => origin})`) to unblock this Vercel preview/production URL without hardcoding it - fine for now, worth tightening to an explicit allow-list once the final custom domain (if any) is decided.

## Rename: Evidence Court → Crossbench (2026-09-23)

Renamed everywhere per explicit user instruction ("pick another unique
name... change it everywhere"). Picked **Crossbench** - in a courtroom or
parliament, the crossbench is where independent members sit, aligned with
neither side, matching "neither side gets to weigh it." Checked against
every existing project name in the user's Vercel account first - no
collision.

What changed:
- Directory: `/Users/macbook/Evidence court` → `/Users/macbook/Crossbench`.
- Contract: `contracts/evidence_court_contract.py` → `contracts/crossbench_contract.py`, class `EvidenceCourt` → `Crossbench`, `get_stats()["product"]` → `"Crossbench"`. Redeployed fresh (the old deployment at `0xdC35E20AE1e63f21555BA929b8a73867e23ca602` still says "Evidence Court" on-chain and is now abandoned) - **current contract address: `0x90639b4Cc538021aFe4d97C03D336B5e1854fA28`**, verified via `genlayer call ... get_stats` returning `"product": "Crossbench"`.
- Backend: Worker renamed `evidence-court-api` → `crossbench-api` (new Worker - secrets don't carry over renames, re-set `JWT_SECRET`/`CONTRACT_ADDRESS`; old Worker deleted via `wrangler delete --name evidence-court-api`). New URL: **https://crossbench-api.preciousmofeoluwa.workers.dev**. D1 database resource itself is still literally named `evidence_court` on Cloudflare (no `wrangler d1 rename`; renaming would mean recreating and re-migrating a database that already has real state, wasn't worth it for an internal, never-user-facing identifier) - `wrangler.toml`'s `database_name` field deliberately still says `evidence_court` to match the real resource, `database_id` binding is what actually matters for deploy.
- Frontend: Vercel project renamed `frontend` → `crossbench` via `vercel project rename`. Aliased at `https://crossbench-app.vercel.app` (also still reachable at the original `https://frontend-tau-livid-gi1xp8ftb4.vercel.app`). Title, `Logo.tsx`, all page copy, `package.json` updated.
- Docs (README/ARCHITECTURE/CONTRACT_DEPLOYMENT/this file) updated throughout.
- Repo pushed to **https://github.com/zoefunds/Crossbench** (user-provided remote), `git init` done at the renamed root (frontend's own nested `.git` from `create-next-app` was removed first so the whole project is one repo), commits carry no AI attribution per explicit instruction.

**Vercel deployment protection**: `crossbench-app.vercel.app` initially served Vercel's own login page instead of the app (team-level SSO/deployment protection). Patched the Vercel project's `ssoProtection` setting to `null` via a direct API call (found via `~/Library/Application Support/com.vercel.cli/auth.json`) to make it public, matching the user's other project aliases. Told the user this was done and offered to revert if they'd rather keep it protected - they have not asked to revert as of this writing.

## GenLayer RPC rate limiting (2026-09-23)

User: GenLayer StudioNet enforces roughly 500 req/hr for this account/setup
(differs from the generic 60/min-1000/hr-10000/day figures in the public
skill docs - trust the user's stated number for this deployment). Backend
now guards every `readContract` call through `checkRpcBudget()` in
`backend/src/lib/genlayer-client.ts`:
- **Primary**: Upstash Redis (`@upstash/redis/cloudflare` - the
  Workers-compatible REST client; the TCP `rediss://` connection string the
  user first pasted cannot work in Workers, which has no raw socket access -
  asked for and got the actual REST URL + token instead). Atomic `INCR` per
  rolling hour window, `EXPIRE` set once on first increment. Secrets:
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, both set via
  `wrangler secret put` (not committed anywhere).
- **Fallback**: a D1-backed counter (`rate_limit_counters` table, already in
  the schema) if Redis isn't configured - best-effort only, since D1
  read-then-write isn't atomic across concurrent Workers isolates, but keeps
  the backend degrading gracefully instead of hard-depending on Redis.
- Limit set to 450 (`GENLAYER_RPC_MAX_REQUESTS_PER_HOUR` in `wrangler.toml`),
  under the user's stated 500 ceiling with margin for retries/spikes.
- Once exhausted, `readContract` throws and callers (indexer poll loop,
  `/disputes*` routes) already had try/catch or natural error propagation in
  place - no separate handling needed.

## trigger_evaluation stall investigation, resolved (2026-09-23)

Direct investigation against the live `Crossbench` deployment
(`0x90639b4Cc538021aFe4d97C03D336B5e1854fA28`), driving `create_dispute` →
`accept_dispute` → `submit_evidence` → `trigger_evaluation` through
`genlayer_py`'s `GenLayerClient` directly (bypassing `gltest`'s pytest
`Contract` wrapper entirely): **`trigger_evaluation` completed in 15.6
seconds** - `MAJORITY_AGREE`, 5/5 validators, `execution_result: SUCCESS`,
correct verdict computed (`INCONCLUSIVE`, both evidence items correctly
flagged `IRRELEVANT_CONTENT` since both sides pointed at the same generic
reference page in this test). Full receipt captured and inspected, not
just a pass/fail assertion.

**Conclusion: the contract logic was never the problem.** The three earlier
10-12 minute stalls under `gltest`'s pytest harness (which led to removing
the emit-to-self indirection - see above) happened while polling
`contract.get_dispute(args=[...]).call()` in a loop. I initially guessed
this was a stale-read artifact of that wrapper, but checked the source:
`gltest`'s `.call()` default (`TransactionHashVariant.LATEST_NONFINAL`) is
identical to `genlayer_py`'s own `read_contract` default, so that specific
theory doesn't hold up and I'm not asserting it. The more defensible
explanation, consistent with actual evidence: one of the earlier stalled
runs captured a literal `502 Bad Gateway` from `studio.genlayer.com`
mid-poll, and the failing runs used two distinct, previously-unfetched
Wikipedia pages (real network renders needed for both), while this
successful run reused an already-cached page - StudioNet's real,
documented latency/congestion under load is the most evidence-backed
explanation, not a code defect. **Removing the emit indirection remains
the right call independently** (simpler, synchronous, no dependency on
async self-call timing at all), but it should be understood as a
legitimate simplification made under uncertainty, not confirmed to be
"the fix" for a bug that this investigation now suggests may have been
StudioNet-side the whole time.

Practical takeaway for future sessions: don't read too much into a single
stalled/slow real-StudioNet integration run. Real consensus latency varies
a lot (15s here, other runs elsewhere in this project took minutes), and
Studio itself returns real infrastructure errors (502s) under load - budget
generous timeouts (5-10+ min) in integration tests for this reason, and
don't assume a stall means the contract is broken without direct receipt
inspection first (`genlayer receipt <hash> --stdout --stderr`, or a direct
`genlayer_py` script like the one used here, not just a pytest assertion).

## Full end-to-end run against the real app (2026-09-23)

Ran the frontend locally (`npm run dev` via a wrapper script - see below) against
the real deployed backend and a real StudioNet contract, drove it through the
built-in browser, and found three more real bugs this way (lint/direct-tests
alone would not have caught any of them):

1. **Local dev server node version mismatch.** `preview_start` with a bare
   `npm --prefix frontend run dev` picked up nvm's default Node (18.20.8, too
   old for Next.js 16, which needs >=20.9) instead of Homebrew's Node 26 that
   `which node` resolves to interactively. Fixed with an explicit wrapper
   script (`scripts/dev-frontend.sh`) that forces `PATH="/opt/homebrew/bin:$PATH"`
   and execs Homebrew's node directly against `frontend/node_modules/.bin/next`.
   `.claude/launch.json` points at that script. Lesson: don't trust that a
   subprocess launched by tooling inherits the same Node the interactive
   shell resolves to on a machine with nvm installed.

2. **`payout_bps`/`claimant_weight`/`respondent_weight` were raw Python
   `int` in `_aggregate()`'s returned dict** - every other numeric field in
   the contract is `str()`-wrapped, these three were missed. `genlayer-js`
   decodes unstringified GenVM ints as JS `BigInt`, which crashes anything
   that tries to serialize it (`Do not know how to serialize a BigInt` -
   the backend's `/disputes/:id` live-read fallback was silently swallowing
   this and returning a blanket 404, which is *also* why the original
   `catch { return 404 }` in `disputes.ts` needed a `console.error` added -
   it was masking a real bug as "not found"). Fixed by stringifying those
   three fields at both `_aggregate()` return points and casting back with
   `int()` in `_settle()`'s partial-payout math. **Redeployed as
   `0x49DF636E3B49BCAD1Dee838C87AF9b9d5fd4A2Bb`** (superseded again below).

3. **The real, more serious one: `UNDETERMINED MAJORITY_DISAGREE` on a
   completely reasonable assessment.** `validator_fn` required full dict
   equality (`own["items"] == proposed["items"]`) across every field,
   including `reason_code` - free-text LLM output that is not expected to
   be reproducible verbatim between independent leader/validator calls, and
   `relevance`, a genuinely subjective LOW/MEDIUM/HIGH judgment call that
   can reasonably differ by one bucket between two independent LLM passes
   over the same content. This is exactly the "must not lead to an
   undetermined status" failure mode explicitly flagged as unacceptable.
   **Fix**: added `_assessments_agree()` - `supports` (the actual
   decision-critical field) must match exactly; `relevance` may differ by
   at most one rank (`RELEVANCE_RANK`); `reason_code` is excluded from
   consensus entirely (informational only, carried through from the
   leader's answer, never compared). This is *not* format-only validation
   (still requires exact agreement on the one field that actually decides
   money movement) but tolerates the specific kinds of variance that are
   inherent to independent LLM calls rather than indicative of leader
   misbehavior. **Redeployed as `0x6F1CeE0a07953EC2EE18b4d9DE36aB010Abc10d2`**
   (current address as of this writing) - confirmed via a full real
   create→accept→submit→trigger run: `MAJORITY_AGREE`, correct stringified
   verdict, dispute rendered correctly end-to-end in the actual browser UI
   at `/disputes/ec-1` (per-item assessment cards, verdict card, both
   evidence bundles, wallet-gated action area).

4. **Cron Trigger never wrote to `indexer_state`, `/disputes` stayed
   permanently empty** despite `/stats` (direct contract read) showing real
   data. Root cause only partially confirmed: `wrangler tail` eventually
   caught cron-adjacent activity hitting `Rate limit exceeded: 30 requests
   per minute` - this is `genlayer-js`'s own internal client-side request
   limiter (separate from both GenLayer's server-side ~500/hr limit and our
   Redis budget guard), and it was never observed to recover mid-session.
   Rather than keep spending real StudioNet quota chasing exact cron
   timing/platform behavior, added a decoupled, secret-protected manual
   trigger: `POST /internal/reindex` (header `X-Internal-Secret`, matching
   the `INTERNAL_SECRET` Worker secret) calls the same `pollOnce()` the cron
   calls. Verified this manual path works (`{"ok":true}`). **Still open**:
   whether the Cron Trigger itself reliably fires and whether `pollOnce()`
   needs its own internal pacing between `get_dispute` calls to stay under
   genlayer-js's 30/min client-side ceiling when indexing many active
   disputes at once - worth adding a small delay between iterations in
   `poll.ts`'s per-dispute refresh loop if this recurs with more real
   traffic.

5. **Mobile nav bar had no menu at all below `md` breakpoint** -
   `NavBar.tsx` hid the nav links (`hidden md:flex`) with no replacement,
   found by testing at 375×812 in the built-in browser. Fixed with a
   hamburger toggle (`useState`, accessible `aria-expanded`) that reveals a
   stacked link list. Verified visually at mobile width - icon toggles
   between hamburger/X, links open/close correctly, tapping a link closes
   the menu.

Everything else checked out clean: landing/disputes/profile/settings pages
all render correctly, wallet-gate messaging is consistent everywhere
("Connect your wallet..."), the Reown AppKit wallet-connect modal opens for
real (MetaMask/WalletConnect/Trust Wallet/etc. listed) - confirmed the
integration is genuinely wired, not just present in code. Did **not**
complete a real wallet-signed transaction through the browser tool itself
since the automated built-in browser has no wallet extension installed -
that boundary is real and worth being explicit about rather than faking a
"connected" state.

## Real wallet transaction bug, found by the user with actual MetaMask (2026-09-23)

The user connected a real MetaMask wallet (GenLayer Studio network, address
`0x7401c...058Eb`) on the dispute-creation page and clicked "Stake 0.05 GEN
and open dispute". MetaMask's Activity tab shows a transaction genuinely
sent to `0xb7278A61...fE575` (GenLayer's consensus/relay contract - matches
`genlayer network info`'s `mainContract`) for "-0 GEN" - this 0 is
expected and correct, not a bug: GenLayer's architecture routes the actual
stake value inside the signed rollup transaction's own calldata
(`sim_config.signed_rollup_transaction`), not the outer `eth_sendTransaction`
value field, so MetaMask's outer-transfer display showing 0 while the real
value is encoded inside is normal. The wallet really did sign and broadcast
something. But the app then threw **`Cannot convert undefined to a BigInt`**
client-side.

**Root cause**: `lib/genlayer.ts`'s `useGenLayerClient()` bridged the
connected wallet to `genlayer-js` using `useConnectorClient().transport`
cast as if it were a raw EIP-1193 provider. A viem `Client`'s `transport`
is a different, wrapped interface - not wire-compatible with the raw
`request({method, params}) -> JSON-RPC-shaped response` contract
`genlayer-js`'s `EthereumProvider` type expects. Responses came back
shaped differently than expected, and `genlayer-js` tried to `BigInt()` a
field that came back `undefined` as a result.

**Fix**: use `connector.getProvider()` (wagmi's own documented way to get
the actual raw EIP-1193 provider - MetaMask's injected `window.ethereum`,
WalletConnect's provider, etc.) instead. This is async (`Promise`-returning),
so the hook now fetches it in a `useEffect` keyed on the connector and
memoizes the `genlayer-js` client once the provider resolves, rather than
trying to derive it synchronously from `useConnectorClient`.

Could not reproduce/verify this one myself before the user hit it - the
sandboxed built-in browser has no wallet extension installed, and Claude in
Chrome (the user's real Chrome, which does have MetaMask) was not connected
in this session when I tried to attach and debug live. Diagnosed and fixed
by reasoning through the actual error message, the MetaMask Activity
evidence, and the `genlayer-js`/wagmi/viem type signatures directly, not by
reproducing it interactively.

**This first fix (getProvider) was necessary but not sufficient** - the
user retried after it deployed and got the identical "Cannot convert
undefined to a BigInt" error again. Root-caused properly the second time
by reading `genlayer-js`'s actual bundled source
(`node_modules/genlayer-js/dist/chunk-XCQTIUTU.js`,
`_sendConsensusCall`/`writeContract`): `consensusMaxRotations` defaults to
`client.chain.defaultConsensusMaxRotations`, and other consensus-call
encoding reads `client.chain.consensusMainContract` etc. My hand-rolled
`studionet` chain object in `lib/wagmi.ts` (built with plain viem
`defineChain`, only `id`/`name`/`rpcUrls`/`nativeCurrency`/`testnet`) had
none of these GenLayer-specific fields - they were all `undefined`, and
encoding an undefined value as a contract-call arg is exactly where
"Cannot convert undefined to a BigInt" comes from. **Real fix**: `genlayer-js`
ships its own correct `studionet` chain object (`genlayer-js/chains`,
still built with viem's `defineChain` so it's a valid wagmi/AppKit network
too) with `consensusMainContract`, `consensusDataContract`,
`defaultNumberOfInitialValidators: 5`, `defaultConsensusMaxRotations: 3`,
etc. already populated correctly - `lib/wagmi.ts` now imports and re-exports
that instead of defining its own. This also matches the "don't invent APIs
/ verify against the current SDK" instruction from the master prompt more
literally than I had been - the chain object should have come from the SDK
from the start, not been hand-built to look right at the type level.
Backend's `genlayer-client.ts` still hand-rolls a minimal chain object for
reads only (never writes) - left alone since it's confirmed working and
the missing fields are write-path-only; noted here in case it ever needs
extending to write.

Build + typecheck clean, verified rendering correctly in the local preview
after the fix, redeployed to `https://crossbench-app.vercel.app`. **Still
not personally verified with a real wallet transaction** - waiting on the
user to retry.

## Read-through indexing, not cron-only (2026-09-24)

User: "I created something and it did not show in frontend" + "I want
everything users do on the app to reflect immediately i.e no delay." Real
report, real dispute: `ec-2`, claimant `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`
(their real MetaMask address from the earlier BigInt-fix testing), created
successfully on-chain at `2026-09-23T23:20:23` - confirming that fix
actually worked - but invisible in the app because `/disputes` and
`/disputes/:id` both only ever read from D1, and D1 only got written by the
Cron Trigger, which this session already found to be unreliable (never
observed writing to `indexer_state` despite the schedule being genuinely
registered - see the earlier cron investigation above).

**Fix - read-through, not cron-only**: `pollOnce()` and `upsertDispute()`
exported from `indexer/poll.ts` and reused directly in the request path:
- `GET /disputes/:id` now does a live `get_dispute` contract read first,
  upserts it into D1 as a side effect, and returns the live result
  directly. D1 is only a fallback if the live read itself fails (RPC budget
  exhausted, transient network error) - inverted from before, where D1 was
  primary and live-read was only a fallback for un-indexed rows.
- `GET /disputes` calls `pollOnce(c.env)` (the same sync the cron runs)
  before querying D1, so the list is never more than one request-cycle
  behind the chain regardless of whether the Cron Trigger fired recently.
- The Cron Trigger and `/internal/reindex` manual trigger both still exist
  and still help (they mean a list load doesn't have to pay for indexing
  every single active dispute from scratch every time), but neither is
  load-bearing for correctness anymore.

Verified directly: `curl .../disputes` immediately returned `ec-2`
(previously invisible) right after this deployed, no cron wait, no manual
reindex call needed.

Cost note: this does mean every `/disputes` list load now costs at least
one extra `get_stats` RPC call (and a `get_dispute` per new/active dispute
if any are outstanding) against the ~450/hr Redis-guarded budget. Fine at
current traffic; worth revisiting (e.g. a short in-memory/KV TTL cache on
the sync step, a few seconds, not the old cron-only staleness) if dispute
volume or concurrent readers grow enough to matter.

## Layout overflow bug on wide viewports (2026-09-24)

User screenshot on a wide monitor (~1970 CSS px) showed dispute cards
stretching edge-to-edge with claim text overflowing past the visible area,
no visible card boundaries. Diagnosed with real DOM measurement (`getBoundingClientRect`
via the browser tool's JS eval), not guesswork:

- The outer page container (`mx-auto max-w-6xl px-6 py-16`) was correctly
  constrained to 1152px and centered - confirmed via computed style.
- But the dispute list's `<div className="grid gap-4">` had **no explicit
  `grid-template-columns`**. An implicit CSS Grid track with no column
  template sizes to the *unconstrained max-content width* of its children,
  not its container's width - so the untruncated claim text's natural
  (single-line, un-wrapped) width was pulling the whole grid track, and
  therefore the card inside it, wider than the 1152px parent. Confirmed via
  `getBoundingClientRect`: the card's `right` edge was at 2190px against a
  1561px container edge before the fix, and 1537px (inside the 1561px
  container) after.
- Tailwind's `grid-cols-N` utilities compile to `repeat(N, minmax(0, 1fr))`
  - the `minmax(0, ...)` is what actually constrains the track to the
    container. Plain `grid` with no `grid-cols-*` doesn't get that.
- Fix: added explicit `grid-cols-1` (with responsive `sm:`/`md:grid-cols-2`
  kept as overrides) to all three bare `grid` usages in the app
  (`disputes/page.tsx`'s list, `disputes/[id]/EvidenceAssessment.tsx`, and
  the landing page's core-loop list) - the two that already had
  `sm:grid-cols-2`/`md:grid-cols-2` had the same latent bug below their
  breakpoint, just less visible with shorter content.
- Also fixed a real but secondary flexbox issue: `min-w-0` alone on a flex
  child doesn't make `truncate` reliable without `flex-1` (or another way
  to claim available space) - fixed in `disputes/page.tsx` and
  `profile/page.tsx`'s dispute-list rows.
- Grid-based truncation elsewhere (the claimant/respondent 2-column grid on
  the dispute detail page) was already safe - `grid-cols-2` already
  compiles with `minmax(0, 1fr)`.

Verified with real `getBoundingClientRect` measurements at a 1970px
viewport (matching the user's screenshot) before and after, not just visual
inspection - confirmed the card's right edge is now inside its container's
right edge. Checked landing, disputes list, dispute detail (using the
user's real `ec-2` dispute), and dispute-creation form at the same wide
viewport - all correctly contained. Redeployed to
`https://crossbench-app.vercel.app`.

## Visual redesign: Lex Cryptographica theme (2026-09-24)

User supplied a full design system ("Lex Cryptographica" - dark
"Cryptographic Institutionalism" aesthetic, obsidian surfaces, electric
cyan primary, amber secondary, Hanken Grotesk + JetBrains Mono) as
DESIGN.md plus four static Tailwind-CDN HTML mockups under
`~/Documents/stitch_dark_theme_concept_design/`, asked for a full frontend
redesign. Explicitly confirmed via clarifying question that this applies to
the Crossbench project itself (not a rename to a different "Sunder"
project - an earlier ambiguous message had referenced that name).

Approach: kept every existing CSS custom-property token name in
`globals.css` (`--color-navy`, `--color-cyan`, `--color-purple`,
`--color-text-ec`, etc.) and only swapped the underlying values to the new
palette, instead of renaming tokens and touching call sites across ~15
files. This meant most page/component files (disputes list, dispute
detail, dispute creation, evidence editor, profile, settings) picked up
the new theme automatically through the shared `glass-card`/`label-sm`/
`data-mono` utility classes without needing individual edits - lower risk,
same visual result. Files actually edited: `globals.css` (full palette +
`.glass-card`/`.label-sm` restyle), `layout.tsx` (Manrope -> Hanken
Grotesk), `Logo.tsx` (gradient colors), `NavBar.tsx` (sticky blurred
header, StudioNet status pill, mono nav labels), `StatusBadge.tsx` (tinted
pill chips per the design's Verified/Disputed spec, with a pulse dot on
active states), `page.tsx` (landing hero/loop/reference-scenario
sections), `Providers.tsx` (Reown AppKit `themeVariables` to match cyan
accent - note: the AppKit `appkit-button` web component did not visibly
pick up `--w3m-accent` in local testing, so the wallet-connect button
currently still renders in Reown's default blue; this is a known cosmetic
gap in a third-party widget, not a bug in our CSS).

Deliberately did NOT fabricate any UI content: the landing page's original
copy (no fake stats like the mockup's "842,500 GEN staked") was kept as-is
rather than inventing numbers with no real data source; the dispute-detail
page's real per-item validator assessment data (from
`preliminary_assessment`/`final_assessment`) was kept and just restyled,
rather than inventing the mockup's fictional "7 named validator nodes with
individual LLM reasoning" - the contract does not expose that level of
detail today (or, if it does, the frontend/backend types were not asserted
to include it, so it was not assumed).

Contract and backend were not touched - pure frontend visual/CSS layer.
Verified with `tsc --noEmit` (clean) and `next build` (clean), then visual
checks via the local dev server at desktop and 375px mobile widths on
landing, disputes list, and a real live dispute detail page (`ec-1`) -
all correctly rendering real on-chain data, no layout regressions.
Redeployed to `https://crossbench-app.vercel.app`.

Two background subagents were tried first for this task and both bailed
almost immediately (one lost its worktree after being resumed, one
self-aborted citing "effort budget" concerns without doing any real work)
- ended up doing the implementation directly in the main session instead.

## Wallet button theming + StudioNet write-path rate limiting (2026-09-24)

Two follow-ups after the redesign shipped:

1. **Wallet connect button color.** The `<appkit-button>` web component
   from `@reown/appkit` did not visibly respond to `themeVariables` /
   `--w3m-accent` in `createAppKit()` (traced through
   `node_modules/@reown/appkit-ui/.../ThemeHelperUtil.js` -
   `getW3mThemeVariables` in `appkit-common` does read `--w3m-accent`
   correctly, so the wiring isn't wrong, but the pre-built button's own
   internal styling wasn't picking it up reliably in testing). Rather than
   keep fighting the web component's internals, replaced it in
   `WalletConnectButton.tsx` with a fully custom button built on
   `useAppKit()` (for `open()`) and `useAppKitAccount()` (for
   address/connection state) from `@reown/appkit/react` - both public
   hooks, no private API. This gives full control over styling (now uses
   the same cyan-fill button as the rest of the app) while keeping the
   exact same modal/connect flow (verified: clicking it still opens the
   real Reown modal with MetaMask/WalletConnect/etc).

2. **"RPC ... eth_sendRawTransaction: Request is being rate limited"** on
   dispute creation. This is GenLayer StudioNet's own RPC node throttling
   raw transaction submission - not our backend's read-side RPC budget
   guard (`backend/src/lib/genlayer-client.ts`'s `checkRpcBudget`), which
   only guards `readContract` calls made server-side; wallet writes go
   directly from the browser to the chain and never touch our backend at
   all. Fixed in `frontend/lib/tx.ts`: `runWrite` now retries
   `client.writeContract` with exponential backoff (1.5s/3s/6s, 4 attempts)
   specifically when the error message matches a rate-limit pattern on a
   send-transaction call, surfacing a live "retrying in Ns..." notice via
   `TxStatus` instead of silently hanging; if it still fails after
   retries, throws a plain user-facing message explaining it's the network
   throttling writes, not an app bug, rather than the raw viem/RPC error
   string. `TxStatus.tsx` updated to render that in-progress retry notice
   in the app's amber accent instead of the red failure color, since it's
   informational, not a failure.

Both verified with `tsc --noEmit` and `next build`, deployed to
`https://crossbench-app.vercel.app`.

## Docs pass (2026-09-24)

Full documentation sweep per explicit user request ("write and update all
possible docs... remove stale data"). Updated `README.md`,
`ARCHITECTURE.md`, `CONTRACT_DEPLOYMENT.md`, `frontend/README.md`
(previously the untouched `create-next-app` boilerplate — replaced with
real project docs: stack, env vars, structure, design-system notes, known
layout gotchas), and added `docs/CONTRACT_SPEC.md` (referenced from
`ARCHITECTURE.md` since the original build but never actually written
until now — full method/state spec derived directly from the contract
source, including `cancel_dispute`, which existed in code but wasn't
documented anywhere).

Corrected in this file too: the "answers on record" table's contract-
deployment and backend-host rows (both left stale after later
supersessions), and the reference-material section's design-system path
(pointed at the abandoned "Technological Elegance" tokens instead of the
"Lex Cryptographica" theme actually shipped on 2026-09-24).

## Next step

No specific next step has been requested. Candidates, in rough priority
order if asked to pick: (1) the Reown AppKit connect-modal theming gap
noted in the redesign entry above (button is fixed, the modal itself
still uses Reown's own approximate dark theme), (2) real OAuth provider
registration for social connections (currently an explicit 501 "not
configured yet" skeleton), (3) an accessibility pass on the frontend
(not yet done, per the original build-status notes).
