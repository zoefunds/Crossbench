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
| Contract | `0x2352A0cBF175F1e69eBc8364A35301570378FF22` |
| Deployment transaction | `0xea3fee2c375a3cf676f49431a1019332d476d1f356e73f5b7621ab2f5a5e2322` |
| Deployed by | `0x8D4E752AE688C21eC7C7D4d8a232B5e0700DBf0f` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Production source commit | `c32e22c5d4a1b4d53761ac35499ec3b84bdae8c7` |

Deployment reached `MAJORITY_AGREE` in one round with all five validators
agreeing. The initial `get_stats()` read confirmed version `0.3.1-studionet`,
fresh/zero state, and balanced accounting. Production now contains labelled
smoke dispute `ec-1`, which completed:
`create_dispute` -> `accept_dispute` -> `submit_evidence` ->
`trigger_evaluation` -> `PRELIMINARY_VERDICT`. The official Ethereum policy
was classified `PRIMARY`; the fetched evidence audit retained both content
fingerprints; the Ethereum genesis-block API reference and its structured
`eip155:1/BLOCK/<hash>` identity were classified `CORROBORATED`; `duplicate_ids`
and `mutated_ids` are empty. Durable current state is in
`docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

Current local suites pass: contract direct tests (34/34), pinned GenVM semantic
validation, backend tests (10/10), frontend tests (9/9), lint, typecheck, and
production build. Both npm audits report zero known vulnerabilities.

The current StudioNet integration used real public Ethereum sources, wallet-
signed writes, 0.1 matched test GEN, and real validator consensus. Its
preliminary result is `INCONCLUSIVE`; settlement is deadline-gated until
`2026-10-09T09:21:10Z`. The resumable test and state file can complete the
deadline phase without duplicating stake-bearing writes.

## Cutover performed (2026-10-07)

1. `fly secrets set CONTRACT_ADDRESS=0x2352A0cBF175F1e69eBc8364A35301570378FF22 -a crossbench-api`
   - rolled out to both machines, health checks passed.
   - `GET /disputes?fresh=1` triggered immediately after to force the
     indexer's documented address-change path (`poll.ts`: on detecting
     `indexer_state.contract_address` no longer matches, it deletes
     `verdicts`, `evidence_items`, `disputes`, and `indexer_state`, then
     reindexes from the new contract). Confirmed: `/disputes` returns the
     new contract state. The latest `/stats` reports version
     `0.3.1-studionet`, one dispute, 0.1 GEN escrow/deposits, and balanced
     accounting. Both Fly machines are version 25 with passing health checks.
2. Vercel production `NEXT_PUBLIC_CONTRACT_ADDRESS` was replaced and the app
   rebuilt with the new value inlined.
3. Vercel deployment `dpl_3iHiVaxMdhxQwmdgCYJs69PbpQn6` was assigned to
   `crossbench-app.vercel.app`.
4. The canonical `/disputes` page renders production `ec-1`, and the deployed
   JavaScript bundles contain the exact 0.3.1 address and not the old address.

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

StudioNet can discard the whole write when outer consensus fails. Version 0.3.1
handles catchable inner exceptions, but a real outer failure still left
`eval_attempts=0`. Do not treat `resolve_stalled_dispute` as network-reliable
until a deterministic two-phase attempt protocol is deployed.

## Rollback-safe recovery production deployment

Version `0.3.1-studionet` was first deployed separately for verification and
then cut over to both production services on 2026-10-07.

| Field | Value |
|---|---|
| Contract | `0x2352A0cBF175F1e69eBc8364A35301570378FF22` |
| Deployment transaction | `0xea3fee2c375a3cf676f49431a1019332d476d1f356e73f5b7621ab2f5a5e2322` |
| Deployed by | `0x8D4E752AE688C21eC7C7D4d8a232B5e0700DBf0f` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Deployment consensus | One round, `MAJORITY_AGREE`, 5/5 validators agreed |
| Latest read verification | `0.3.1-studionet`, one dispute, 0.1 GEN escrow, balanced accounting |
| Application routing | Fly API and canonical Vercel frontend |

In direct-VM execution, 0.3.1 catches evaluation or finalization failures,
increments the stage counter, records stage and timestamp, saves the dispute,
and returns without raising. Direct tests cover both stages through refund and
withdrawal accounting.

The first post-cutover real StudioNet assessment did not advance and a direct
read still reported `eval_attempts=0`. This demonstrates that the network's
outer consensus failure can occur outside the contract catch. Therefore the
rollback-safe threshold is not live-verified and must not be represented as a
complete StudioNet fix; a separate deterministic prepare/attempt transaction
is required for network-independent failure accounting. A later assessment
retry succeeded and moved `ec-1` to `PRELIMINARY_VERDICT`; that success does not
change the failure-counter observation.

## Rollback

Restore both Fly `CONTRACT_ADDRESS` and Vercel
`NEXT_PUBLIC_CONTRACT_ADDRESS` to the same prior address, rebuild the frontend,
force reindex, and verify stats. Never point the UI/backend at different
contracts. Never abandon accepted stakes on the replacement; resolve or disclose
them before rollback.

See `docs/ROLLBACK_CUTOVER.md` for application rollback details.
