# Fly.io backend migration

The backend now runs as a Node/Hono service with PostgreSQL. Cloudflare is no longer part of the runtime or deployment path.

## Required Fly resources

Create a Fly app and a PostgreSQL provider/database, then set these secrets on the app:

`DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SECRET`, `CONTRACT_ADDRESS`, `GENLAYER_RPC_URL`, `GENLAYER_CHAIN_ID`, and `GENLAYER_RPC_MAX_REQUESTS_PER_DAY`.

Run `npm run db:migrate` against the PostgreSQL URL before starting the app. The service runs the indexer every two minutes and exposes `/health` for Fly checks.

## Data-preserving cutover

1. Export all rows from the Cloudflare D1 database before changing traffic. Preserve the export in encrypted storage.
2. Load the rows into PostgreSQL, including users, sessions, social connections, disputes, evidence, verdicts, indexer state, and rate-limit counters. Existing refresh sessions remain valid because `JWT_SECRET` is copied unchanged.
3. Deploy the image with `fly deploy`, set secrets, run migrations, and verify `/health`, `/stats`, `/disputes`, SIWE login, and a protected social endpoint.
4. Update the frontend API base URL to the Fly hostname and perform a smoke test against the new host.
5. Keep the Cloudflare Worker and D1 read-only during a short verification window. Only after the Fly app and data checks pass should the Worker, D1 database, and KV namespace be deleted.

The final deletion is intentionally not automated by this repository because it is irreversible and requires an explicit, credentialed operator action after verification.
