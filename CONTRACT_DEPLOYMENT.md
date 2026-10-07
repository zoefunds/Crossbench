# Intelligent Contract deployment and cutover

## Current production deployment (cutover complete)

`contracts/crossbench_contract.py` now verifies source provenance, gives
unverified evidence zero weight, rejects canonical duplicate URLs, detects
same-content duplicates, records mutations, and compares validator judgments
with bounded semantic compatibility rather than brittle whole-page hash
equality. Deployed, verified, and cut over to production on 2026-10-07.

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6` |
| Deployment transaction | `0x231b7a38b08d58fed9fb7037960e56a89de74098b03588651e5c5232b143573e` |
| Deployed by | `0xF526ADbdEB5169e7CeA32c06EF69d7ce4a2D6276` (the documented `crossbench-live-claimant-v1` test identity, funded for this purpose) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source commit | `4c94dc2` (`contracts/crossbench_contract.py`) |

Deployment reached `MAJORITY_AGREE` in one round (3 agreeing validators,
2 idle). `get_stats()` confirmed fresh/zero state and balanced accounting.
A real, stake-backed lifecycle then ran against the deployed address:
`create_dispute` -> `accept_dispute` -> `submit_evidence` ->
`trigger_evaluation` -> `PRELIMINARY_VERDICT`. The official Ethereum policy
was classified `PRIMARY`; the fetched evidence audit retained both content
fingerprints; the unavailable Blockscout page was safely classified
`UNVERIFIED` and added zero weight; `duplicate_ids` and `mutated_ids` were
empty. Durable state is in `docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

Pre-cutover local suites passed: contract direct tests (30/30), pinned GenVM
semantic validation, backend tests (10/10), frontend tests (7/7), lint,
typecheck, and webpack build. Post-documentation regression results are
recorded in the release commit.

The production-visible StudioNet integration was run with real public
Ethereum sources and real validator consensus. Settlement and withdrawal are
deadline-gated until `2026-10-09T07:34:50Z`; the resumable test and state file
will complete that final phase without duplicating stake-bearing writes.

## Cutover performed (2026-10-07)

1. `fly secrets set CONTRACT_ADDRESS=0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6 -a crossbench-api`
   - rolled out to both machines, health checks passed.
   - `GET /disputes?fresh=1` triggered immediately after to force the
     indexer's documented address-change path (`poll.ts`: on detecting
     `indexer_state.contract_address` no longer matches, it deletes
     `verdicts`, `evidence_items`, `disputes`, and `indexer_state`, then
     reindexes from the new contract). Confirmed: `/disputes` returns the
     new contract's `ec-1`; `/stats` reports version `0.2.0-studionet`, one
     dispute, balanced accounting, and the expected 0.1 GEN escrow.
2. `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes` +
   `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production` (new address) +
   `vercel --prod --yes` to rebuild with the value inlined.
3. Vercel deployment `dpl_FGSxpUGrrKhjvyWZan136yEEDKEX` was assigned to
   `crossbench-app.vercel.app`; generated duplicate aliases were removed.
4. The canonical `/disputes` page renders `ec-1`, and the deployed
   `/disputes/new` JavaScript bundle contains the exact new contract address.

The old contract address below is no longer referenced by any running
service - its disputes are not deleted on-chain (contracts/data are
immutable) but are no longer indexed or displayed.

## Superseded deployments and escrow recovery

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` |
| Deployment transaction | `0x994141b9b4131b0b1abc1cc38870256bd9acdc87f0a4ef37cdf4460f0e56450d` |
| Source | Previous production (`ec-1` and `ec-3` await deadline settlement) |

Contracts are immutable and each deployment starts with empty dispute/accounting
state. The complete inventory of outstanding test stakes—including the two
intermediate validation deployments—is in `docs/ESCROW_RECOVERY.md`. None is
referenced by a running service.

## Pre-deployment gates

```bash
pytest contracts/tests/direct/ -q
python3 -m py_compile contracts/crossbench_contract.py
GENVM_VERSION=v0.2.16 genvm-lint check contracts/crossbench_contract.py --json
```

The direct suite covers lifecycle authorization/deadlines, evidence validation,
assessment normalization/agreement, deterministic payouts, credits, withdrawal,
and accounting. It mocks nondeterminism; run an explicitly budgeted StudioNet
integration after deployment as well.

## Deploy

```bash
genlayer network set studionet
genlayer deploy --contract contracts/crossbench_contract.py --rpc https://studio.genlayer.com/api
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
