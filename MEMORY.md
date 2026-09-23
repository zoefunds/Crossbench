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
| Authentication | External wallet connect (MetaMask/Rainbow/Zerion), SIWE-style signed-challenge auth. Connecting a wallet alone is never treated as authentication. |
| Dispute scope (v1) | Narrow: moderation-appeal reference case only. Generalize after the core loop is proven. |
| Evidence bundle cap | 3 items per party. Web pages + on-chain references only — no arbitrary file uploads. |
| Counter-stake | Required. Responding party must counter-stake within the response window or claimant wins by default/timeout. |
| Challenge window | Fixed 48 hours for all disputes (not configurable in v1). |
| Contract deployment | User deploys the contract themselves via GenLayer Studio/CLI. Claude does NOT deploy it. Contract address is supplied by the user after deployment and wired into config. |
| Frontend host | Vercel (CLI already installed locally). |
| Backend host | Fly.io (CLI already installed locally). |
| Socials | Connection-based (OAuth-style), never raw username typing, to prevent impersonation. |

## Reference material (inspiration, not copy — see anti-plagiarism note below)

- `~/Downloads/DESIGN.md` — dark "Technological Elegance" design token spec. Use as the visual/design-system reference for Crossbench's frontend.
- `~/Downloads/dashboard.html`, `escrow.html`, `Transactions.html`, `Ai-coach.html` — component/layout prototypes from the same batch as DESIGN.md. Use as UI reference, reinterpreted for Crossbench's actual flows (dispute creation, evidence bundles, verdict/settlement), not copy-pasted.
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
- [ ] Frontend (Next.js, wallet connect, dispute/evidence/verdict flows, DESIGN.md tokens)
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

## Next step

Rewrite the backend section of ARCHITECTURE.md for Cloudflare Workers + D1,
then write contract direct/integration tests with the `genlayer-dev`
testing skills, then scaffold the Workers backend.
