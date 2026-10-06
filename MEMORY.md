# Crossbench current operational memory

This file intentionally contains only current, verified state. Superseded
contract addresses, retired disputes, and discarded implementation hypotheses
are removed as soon as they're superseded. Git history retains them if
forensic archaeology is ever required.

## Production state

- GitHub: `https://github.com/zoefunds/Crossbench`, branch `main`.
- Frontend: `https://crossbench-app.vercel.app/` only. No other Crossbench
  Vercel alias exists.
- Backend: `https://crossbench-api.fly.dev/`, Fly app `crossbench-api`.
- Fly topology: two `ams` machines with rolling deployment and passing health
  checks.
- Contract: `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` on StudioNet chain
  `61999`. Deployed 2026-10-06.
- Deployment tx: `0x994141b9b4131b0b1abc1cc38870256bd9acdc87f0a4ef37cdf4460f0e56450d`.
- Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
- Backend contract secret is named `CONTRACT_ADDRESS`, not
  `GENLAYER_CONTRACT_ADDRESS`.
- Backend RPC budget is `4000` reads per UTC day. Production currently has no
  Upstash secret names deployed, so the atomic PostgreSQL counter is
  authoritative.
- The prior contract (`0x44a98ec678A32aCc7024Db2B6242db62b509E8cA`) is
  orphaned: no running service references it. Its disputes still exist
  on-chain (contracts are immutable) but are not indexed or displayed
  anywhere. See `CONTRACT_DEPLOYMENT.md` for the full cutover record.

## Contract hardening (2026-10-06)

The deployed contract added, relative to the prior address:

- `CATEGORY_GUIDANCE`: each of the 4 `claim_category` values injects a
  distinct adjudication rubric into the consensus prompt.
- `BLOCKED_EVIDENCE_HOSTS`: rejects link-shortener/anonymous-paste evidence
  hosts (and subdomains) at submission time.
- Content-hash agreement: validators must now match on a SHA-256 fingerprint
  of their independently fetched evidence content, not only on verdict
  fields.
- `source_integrity.mutated_ids`: records any item whose content changed
  between the preliminary and final consensus run.
- `resolve_stalled_dispute`: refunds both stakes after
  `STALL_ATTEMPT_THRESHOLD` (3) recorded consensus failures and
  `STALL_GRACE_PERIOD` (72h) past the relevant deadline. New terminal status
  `NO_CONSENSUS_REFUNDED`.
- Frontend `withdraw_credit` was previously only reachable when
  `status == SETTLED`. It is now reachable for `SETTLED`, `CANCELLED`,
  `DEFAULTED_NO_RESPONSE`, and `NO_CONSENSUS_REFUNDED`, and the profile page
  has its own standing withdraw button (previously display-only).

Full detail and the specific team-review items each change answers: `REVIEW.md`.

## Live lifecycle evidence (current contract)

- `ec-1`: created, counter-staked, both evidence bundles submitted, real
  validator consensus reached `PRELIMINARY_VERDICT` (`INCONCLUSIVE` - both
  `example.com` placeholder evidence URLs were unreachable, correctly forced
  to `NEITHER`/`LOW`/`SOURCE_UNAVAILABLE`). Still in its real 48-hour
  challenge window as of 2026-10-06.
- `ec-2`: created, cancelled by the claimant, credit withdrawn. Proves the
  refund-workflow fix end to end: credit went `0.05 GEN -> 0`.
- Three real-consensus integration tests
  (`contracts/tests/integration/test_lifecycle.py -m slow`, excluding the
  production-visible and deadline-resume tests) passed against disposable
  throwaway deployments of the current contract in 201 seconds combined:
  `test_full_moderation_appeal_lifecycle_real_consensus`,
  `test_adversarial_evidence_content_is_not_authoritative`,
  `test_symmetric_treatment_of_both_bundles`.

Not yet run: `test_production_visible_lifecycle_real_consensus` (writes a
labelled dispute to the live production contract) and
`test_resume_recorded_live_lifecycle_after_challenge_expiry` (needs a real
48-hour wait past a recorded challenge deadline).

## Verified design decisions

- Contract logic, not backend logic, controls every protocol transition and GEN.
- Backend GenLayer access is read-only and contains no private key.
- Every validator runs the same fetch-and-assess function independently, and
  must now also agree on a content-hash fingerprint of what it fetched.
- Consensus compares exact `supports`, exact payout-critical `relevance`, and
  exact `content_hash`. `reason_code` is leader-authored informational
  context only.
- Unreachable sources normalize to `NEITHER`/`LOW`.
- URL validation rejects credentials, literal internal/private targets, and
  link-shortener/paste hosts. DNS rebinding defense after resolution depends
  on GenLayer's fetch sandbox.
- Settlement uses integer arithmetic and maintains the accounting invariant.
- Frontend does not update on `ACCEPTED`; it waits for `FINALIZED` plus
  successful execution, then forces a live read.
- All applicable windows have one-second UI countdowns and locally expire
  action buttons; contract time remains authoritative.
- Successfully finalized actions disable immediately to prevent repeat clicks.
- Autofill is structurally valid but explicitly fictional; generic context
  pages may correctly yield an inconclusive verdict.
- OAuth/social account linking was removed from source, UI, configuration,
  compiled output, and schema. Migration `0004` drops its legacy table.

## Backend hardening

- PostgreSQL rate/RPC counters are single-statement atomic upserts.
- A shared PostgreSQL advisory lock coordinates index polls across both Fly
  machines; forced refresh waits and scheduled overlap skips.
- On a contract-address change, the indexer clears only contract-derived
  mirror tables (`verdicts`, `evidence_items`, `disputes`, `indexer_state`)
  and rebuilds from the new deployment; authentication data is untouched.
  Verified live during the 2026-10-06 cutover.
- Refresh sessions are opaque hashed tokens and rotate with one consume/replace
  statement. Access JWTs last 15 minutes and refresh one minute early.
- Runtime startup fails closed for missing database, secrets, origin, RPC, chain,
  or contract address.
- Cleanup runs hourly under an advisory lock.
- Operational events cover indexer errors, RPC exhaustion, validator failures,
  stuck finality, and cleanup failures.

## Latest verification baseline (2026-10-06)

- Contract direct suite: 25 passing (18 pre-existing + 7 new hardening tests).
- Contract real-consensus integration suite: 3 passing (see above).
- Backend suite: 10 passing; typecheck passing.
- Frontend: 7 passing; typecheck passing.
- `genvm-lint check`: 3/3 lint checks passing (runner-tarball validation step
  fails in this environment only because the pinned runner archive isn't
  cached locally - unrelated to source correctness).
- Live production: `GET /health` 200, `GET /stats` reports the current
  contract with `accounting_balanced: true`, canonical frontend 200 and
  showing only the current contract's disputes.

Re-run the complete gates immediately before every commit/deploy. Update this
baseline only from actual command output.

## Known operational constraints

- StudioNet can be slow or transiently return TLS/RPC errors. Write retries must
  check the on-chain postcondition before rebroadcasting.
- GenLayer contracts are immutable. A redeploy creates empty state, so never
  switch addresses while unresolved stakes exist without an explicit migration
  plan.
- Vercel automatically reintroduces a project alias during production deploys.
  Always assign the canonical alias and remove every other Crossbench alias.
- The `genlayer write`/`genlayer call` CLI (v0.39.2 in this environment)
  hardcodes transaction value to `0` and cannot drive payable methods
  (`create_dispute`, `accept_dispute`). Payable writes from a script need
  `genlayer-js` directly (`createClient`/`writeContract` with a `value`).
