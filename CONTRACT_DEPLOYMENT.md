# Intelligent Contract deployment and cutover

## Current production deployment (cutover complete)

`contracts/crossbench_contract.py` now verifies source provenance, gives
unverified evidence zero weight, rejects canonical duplicate URLs, detects
same-content duplicates, records mutations, and compares validator judgments
with bounded semantic compatibility rather than brittle whole-page hash
equality. Version 0.3 additionally binds an intended respondent, verifies a
declared policy issuer, and uses structured on-chain identities for validation
and cross-explorer deduplication. Deployed, verified, and cut over on 2026-10-07.

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x5904faF3215cC2B0664adf5Fa0a8f0C000e5BAF6` |
| Deployment transaction | `0x08ba5e754509bf9bd5d877300bf059aae50abbb88461f1e487349c64d76b3072` |
| Deployed by | `0x8D4E752AE688C21eC7C7D4d8a232B5e0700DBf0f` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source state | Verified working tree; intentionally uncommitted pending user approval |

Deployment reached `MAJORITY_AGREE` in one round (3 agreeing validators,
2 idle). `get_stats()` confirmed fresh/zero state and balanced accounting.
A real, stake-backed lifecycle then ran against the deployed address:
`create_dispute` -> `accept_dispute` -> `submit_evidence` ->
`trigger_evaluation` -> `PRELIMINARY_VERDICT`. The official Ethereum policy
was classified `PRIMARY`; the fetched evidence audit retained both content
fingerprints; the Ethereum genesis-block API reference and its structured
`eip155:1/BLOCK/<hash>` identity were classified `CORROBORATED`; `duplicate_ids`
and `mutated_ids` were empty. Durable state is in
`docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

Current local suites pass: contract direct tests (33/33), pinned GenVM semantic
validation, backend tests (10/10), frontend tests (9/9), lint, typecheck, and
production build. Both npm audits report zero known vulnerabilities.

The production-visible StudioNet integration was run with real public
Ethereum sources and real validator consensus. Settlement and withdrawal are
deadline-gated until `2026-10-09T08:13:12Z`; the resumable test and state file
will complete that final phase without duplicating stake-bearing writes.

## Cutover performed (2026-10-07)

1. `fly secrets set CONTRACT_ADDRESS=0x5904faF3215cC2B0664adf5Fa0a8f0C000e5BAF6 -a crossbench-api`
   - rolled out to both machines, health checks passed.
   - `GET /disputes?fresh=1` triggered immediately after to force the
     indexer's documented address-change path (`poll.ts`: on detecting
     `indexer_state.contract_address` no longer matches, it deletes
     `verdicts`, `evidence_items`, `disputes`, and `indexer_state`, then
     reindexes from the new contract). Confirmed: `/disputes` returns the
     new contract's `ec-1`; `/stats` reports version `0.3.0-studionet`, one
     dispute, balanced accounting, and the expected 0.1 GEN escrow.
2. `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --yes` +
   `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production` (new address) +
   `vercel --prod --yes` to rebuild with the value inlined.
3. Latest Vercel deployment `dpl_2mDUH6rHKDNNuATuxzvfLAT4FsRu` was assigned
   to `crossbench-app.vercel.app` after the complete autofill update.
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

Assign the canonical hostname after deployment. Vercel-managed deployment and
project hostnames may remain reachable, but they are not application origins:
production SIWE/CORS and published links use `crossbench-app.vercel.app`.

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

StudioNet currently reverts writes whose outer consensus fails, including a
counter update attempted before raising. Verify network failure semantics
before relying on `resolve_stalled_dispute`; see `docs/ESCROW_RECOVERY.md`.

## Rollback

Restore both Fly `CONTRACT_ADDRESS` and Vercel
`NEXT_PUBLIC_CONTRACT_ADDRESS` to the same prior address, rebuild the frontend,
force reindex, and verify stats. Never point the UI/backend at different
contracts. Never abandon accepted stakes on the replacement; resolve or disclose
them before rollback.

See `docs/ROLLBACK_CUTOVER.md` for application rollback details.
