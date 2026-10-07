# Fly.io backend operations

The Cloudflare-to-Fly migration is complete. Cloudflare Workers, D1, and KV are
not part of the current runtime. This file records the real Fly/PostgreSQL
deployment rather than obsolete migration steps.

## Production inventory

- App: `crossbench-api`
- URL: <https://crossbench-api.fly.dev/>
- Region: `ams`
- Image: `crossbench-api:deployment-01M45665XWTWC0N8JM5034PW9M`
- Machines: two version-25 app machines in `ams`, both started with passing
  `GET /health` checks as of 2026-10-07
- Runtime: Node.js 22, Hono, PostgreSQL
- Process: `node dist/server.js`
- Contract variable: `CONTRACT_ADDRESS`
- Current contract: `0x2352A0cBF175F1e69eBc8364A35301570378FF22`

Required secret names are `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SECRET`,
`CONTRACT_ADDRESS`, `GENLAYER_RPC_URL`, `GENLAYER_CHAIN_ID`,
`GENLAYER_NETWORK`, and `GENLAYER_RPC_MAX_REQUESTS_PER_DAY`. Optional Upstash
variables switch the already-atomic PostgreSQL budget counter to Redis.

## Verify and deploy

```bash
cd backend
npm ci
npm test
npm run typecheck
npm run build
npm audit --audit-level=low
fly deploy --remote-only
fly status -a crossbench-api
curl -fsS https://crossbench-api.fly.dev/health
curl -fsS https://crossbench-api.fly.dev/stats
curl -fsS 'https://crossbench-api.fly.dev/disputes?fresh=1&limit=50'
```

Run migrations before code requiring a new table:

```bash
fly ssh console -a crossbench-api -C 'node dist/migrate.js'
```

Migrations are idempotent and lexical. `0004` intentionally drops the unused
legacy `social_connections` table; no OAuth/social routes remain.

## Internal endpoints

These require `X-Internal-Secret` and are never browser APIs:

- `POST /internal/reindex` — wait for the shared index lock and synchronize.
- `POST /internal/cleanup` — run coordinated expired-data cleanup.
- `GET /internal/operations` — return the latest 100 operational events.

Never expose the internal secret or add a backend signer/private key.

## Rollback

Use `fly releases -a crossbench-api`, then deploy the chosen prior image with
`fly deploy --image <image> -a crossbench-api`. If an old image expects the
removed empty social table, recreate only that table; do not roll back indexed
or SIWE data. See `../docs/ROLLBACK_CUTOVER.md` for the full procedure.
