# Intelligent Contract deployment and cutover

## Current production deployment (cutover complete)

`contracts/crossbench_contract.py` gained source-authenticity consensus
(content-hash agreement), mutable-evidence detection (`source_integrity`),
category-aware adjudication rubrics, and a `resolve_stalled_dispute`
recovery path for failed consensus (see `docs/CONTRACT_SPEC.md`). Deployed,
verified, and cut over to production on 2026-10-06.

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` |
| Deployment transaction | `0x994141b9b4131b0b1abc1cc38870256bd9acdc87f0a4ef37cdf4460f0e56450d` |
| Deployed by | `0xF526ADbdEB5169e7CeA32c06EF69d7ce4a2D6276` (the documented `crossbench-live-claimant-v1` test identity, funded for this purpose) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source | `contracts/crossbench_contract.py` (post-hardening) |

Verification performed against the new address (5/5 validators agreed on
both transactions):
- `get_stats()` confirmed fresh/zero state and `accounting_balanced: true`.
- **E2E 1 (refund workflow)**: `create_dispute` -> `cancel_dispute` ->
  `withdraw_credit`, using the `crossbench-live-claimant-v1` identity.
  Credit went `0.05 GEN -> 0` and status reached `CANCELLED` - this is the
  exact path the review flagged as broken.
- **E2E 2 (real consensus)**: `create_dispute` -> `accept_dispute` ->
  `submit_evidence` -> `trigger_evaluation`, using both test identities.
  Real multi-validator GenVM consensus ran (not mocked) and reached
  `PRELIMINARY_VERDICT` with matching `content_hash` fingerprints recorded
  in `evidence_fingerprints` for both items, deterministically forced to
  `SOURCE_UNAVAILABLE`/`NEITHER`/`LOW` since the placeholder `example.com`
  evidence URLs aren't real pages.

Local test suites also pass: `pytest contracts/tests/direct/ -q` (25/25),
`genvm-lint check` (3/3), backend `npm test` (10/10), frontend
`tsc --noEmit` clean.

The StudioNet integration suite (`contracts/tests/integration/test_lifecycle.py`)
was then run for real: 3 of its 5 non-deadline tests are self-contained
(each deploys its own disposable contract) and ran clean -
`test_full_moderation_appeal_lifecycle_real_consensus`,
`test_adversarial_evidence_content_is_not_authoritative`,
`test_symmetric_treatment_of_both_bundles` - 3 passed in 201s
(`pytest contracts/tests/integration/test_lifecycle.py -m slow -k "not production_visible" --network studionet`).
`test_production_visible_lifecycle_real_consensus` (writes a labelled test
dispute directly to the live production contract) and
`test_resume_recorded_live_lifecycle_after_challenge_expiry` (needs a real
48-hour wait past a recorded challenge deadline) were run/scheduled
separately - see `MEMORY.md` for their current status.

## Cutover performed (2026-10-06)

1. `fly secrets set CONTRACT_ADDRESS=0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A -a crossbench-api`
   - rolled out to both machines, health checks passed.
   - `GET /disputes?fresh=1` triggered immediately after to force the
     indexer's documented address-change path (`poll.ts`: on detecting
     `indexer_state.contract_address` no longer matches, it deletes
     `verdicts`, `evidence_items`, `disputes`, and `indexer_state`, then
     reindexes from the new contract). Confirmed: `/disputes` now returns
     only the new contract's two disputes; `/stats` reports the new
     contract's fresh counts.
2. `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes` +
   `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production` (new address) +
   `vercel --prod --yes` to rebuild with the value inlined.
3. `vercel alias set <new-deployment> crossbench-app.vercel.app` - the
   canonical URL was unaliased (serving a stale cached build from a
   different/prior deployment) and now points at the current production
   build.
4. Verified live in a browser: `https://crossbench-app.vercel.app/disputes`
   shows only the two disputes created against the new contract
   (`ec-1`/`ec-2`, the hardening E2E tests from this cutover); the prior
   contract's `ec-1`/`ec-2` ("CONTENT LISTING MISMATCH" claims) no longer
   appear anywhere on the canonical frontend.

The old contract address below is no longer referenced by any running
service - its disputes are not deleted on-chain (contracts/data are
immutable) but are no longer indexed or displayed.

## Prior production deployment (superseded, orphaned)

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x44a98ec678A32aCc7024Db2B6242db62b509E8cA` |
| Deployment transaction | `0x3aeb0ebe64993e369ddb4ed633fa3ecf7e057ab82172785a1bd0a6aceb0ea623` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source | `contracts/crossbench_contract.py` (pre-hardening) |

Contracts are immutable and each deployment starts with empty dispute/accounting
state. Do not cut over while the old address has unresolved stakes unless a
public, tested migration plan exists.

## Pre-deployment gates

```bash
pytest contracts/tests/direct/ -q
python3 -m py_compile contracts/crossbench_contract.py
genvm-lint check contracts/crossbench_contract.py --json
```

The direct suite covers lifecycle authorization/deadlines, evidence validation,
assessment normalization/agreement, deterministic payouts, credits, withdrawal,
and accounting. It mocks nondeterminism; run an explicitly budgeted StudioNet
integration after deployment as well.

## Deploy

```bash
genlayer deploy contracts/crossbench_contract.py --network studionet
```

Record the new address, deployment transaction, source commit, runner, UTC time,
and pre-cutover stats. Confirm `get_stats` identifies Crossbench, StudioNet, chain
61999, zero/fresh state, and balanced accounting.

## Coordinated wiring

### Backend

The real Fly secret name is `CONTRACT_ADDRESS`:

```bash
fly secrets set CONTRACT_ADDRESS=0xNEW -a crossbench-api
```

The restart fails closed if the value is absent or malformed. On the first poll,
the indexer sees the address change, clears only contract-derived mirror tables,
resets its watermark, and rebuilds from the new contract.

### Frontend

Set `NEXT_PUBLIC_CONTRACT_ADDRESS` for Vercel production. It is inlined at build
time, so changing the environment value without redeploying is ineffective.

```bash
cd frontend
vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
vercel --prod --yes
vercel alias set <new-deployment-host> crossbench-app.vercel.app
```

Remove the automatically generated Crossbench project alias after assigning the
canonical hostname.

## Post-cutover proof

1. `GET /stats` returns the new contract state and balanced accounting.
2. `GET /disputes?fresh=1` triggers a coordinated full index pass.
3. Both Fly machines are started with passing health checks.
4. The canonical frontend's bundled address equals the backend address.
5. Open a labelled test dispute on the new production address, counter-stake,
   submit both bundles, and complete real validator consensus.
6. Confirm the dispute appears on the canonical frontend.
7. Respect the real challenge window, then settle and withdraw with the correct
   owner wallets.

Record durable state in `docs/` so the deadline phase can resume idempotently.

## Rollback

Restore both Fly `CONTRACT_ADDRESS` and Vercel
`NEXT_PUBLIC_CONTRACT_ADDRESS` to the same prior address, rebuild the frontend,
force reindex, and verify stats. Never point the UI/backend at different
contracts. Never abandon accepted stakes on the replacement; resolve or disclose
them before rollback.

See `docs/ROLLBACK_CUTOVER.md` for application rollback details.
