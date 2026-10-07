# Production cutover and rollback runbook

## Immutable invariants

- Only frontend URL: `https://crossbench-app.vercel.app/`.
- Backend: `https://crossbench-api.fly.dev/`.
- Current contract: `0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6`.
- Backend contract access remains read-only with no signer/private key.
- PostgreSQL contract rows are a cache; chain state is authoritative.
- Backend and frontend contract addresses must always match.

## Pre-change record

Before any production change, record:

- Git commit and clean/dirty state;
- current Fly release/image and both machine health states;
- current Vercel deployment backing the canonical alias;
- contract address, deployment transaction, `get_stats`, unresolved disputes,
  escrow, and claimable credits;
- current database migration list and a recoverable PostgreSQL backup.

Do not cut over a contract with unresolved stakes without a stakeholder-approved
state/value migration plan.

## Backend release

1. Run backend tests, typecheck, build, and audit.
2. Run new migrations against the target database.
3. Deploy with `fly deploy --remote-only` from `backend/`.
4. Confirm both machines reach `started` with passing health checks.
5. Verify `/health`, `/stats`, and `/disputes?fresh=1`.
6. Exercise canonical-origin CORS and SIWE refresh rotation.
7. Inspect protected operational events for rollout failures.

Rollback:

```bash
fly releases -a crossbench-api
fly deploy --image <previous-image> -a crossbench-api
fly status -a crossbench-api
```

Migrations are forward-compatible with current code. Migration `0004` only drops
the unused social-link table. An old image that still selects it would require
recreating an empty compatible table before rollback; never restore OAuth routes
or stale linked-account data.

## Frontend release

1. Run tests, typecheck, ESLint, webpack build, and audit.
2. Deploy with `vercel --prod --yes` from `frontend/`.
3. Point `crossbench-app.vercel.app` at the returned deployment.
4. Remove all other Crossbench project/generated aliases.
5. Verify canonical root and a live dispute detail return HTTP 200.
6. Verify removed aliases return 404.
7. Confirm the frontend bundle uses the current API and contract address.

Rollback by reassigning `crossbench-app.vercel.app` to the recorded prior
deployment, then remove any alias created by the failed rollout. Do not expose a
second public URL.

## Contract cutover

1. Complete the contract gates in `CONTRACT_DEPLOYMENT.md`.
2. Deploy and verify the replacement before routing users to it.
3. In one maintenance window, set Fly `CONTRACT_ADDRESS`, set Vercel
   `NEXT_PUBLIC_CONTRACT_ADDRESS`, redeploy both, and force reindex.
4. Verify the backend cleared the old contract mirror and reports the new stats.
5. Run a real labelled lifecycle and record its challenge deadline.

Contract rollback restores both configurations and rebuilds/reindexes. Because
contract state cannot be copied by changing an address, rollback is a routing
operation—not a state rollback. Explicitly account for stakes on both deployments.

## Incident thresholds

- Stop new writes if frontend/backend addresses diverge.
- Investigate any `accounting_balanced=false` immediately.
- Investigate repeated `INDEXER_FAILURE`, `VALIDATOR_FAILURE`, or
  `RPC_BUDGET_EXHAUSTED` events before retrying broad reindex operations.
- A `TX_FINALITY_STUCK` event is not proof of failure; inspect the transaction
  before rebroadcasting to avoid duplicate writes.
