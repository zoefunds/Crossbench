# Intelligent Contract deployment and cutover

## Current production deployment

| Field | Value |
|---|---|
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x44a98ec678A32aCc7024Db2B6242db62b509E8cA` |
| Deployment transaction | `0x3aeb0ebe64993e369ddb4ed633fa3ecf7e057ab82172785a1bd0a6aceb0ea623` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Source | `contracts/crossbench_contract.py` |

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
