# Crossbench current operational memory

This file intentionally contains only current, verified state. Historical
Cloudflare/D1 deployments, superseded contract addresses, retired Vercel aliases,
and discarded implementation hypotheses were removed on 2026-10-05. Git history
retains them if forensic archaeology is ever required.

## Production state

- GitHub: `https://github.com/zoefunds/Crossbench`, branch `main`.
- Frontend: `https://crossbench-app.vercel.app/` only.
- Backend: `https://crossbench-api.fly.dev/`, Fly app `crossbench-api`.
- Fly topology: two `ams` machines with rolling deployment and passing health
  checks.
- Contract: `0x44a98ec678A32aCc7024Db2B6242db62b509E8cA` on StudioNet chain `61999`.
- Deployment tx: `0x3aeb0ebe64993e369ddb4ed633fa3ecf7e057ab82172785a1bd0a6aceb0ea623`.
- Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
- Backend contract secret is named `CONTRACT_ADDRESS`, not
  `GENLAYER_CONTRACT_ADDRESS`.
- Backend RPC budget is `4000` reads per UTC day. Production currently has no
  Upstash secret names deployed, so the atomic PostgreSQL counter is authoritative.

## Live lifecycle evidence

Two durable StudioNet runs exist:

1. Isolated exact-source contract `0x99F4ab5F4bdB84dcFB59c070FA7872F2C89158B0`,
   dispute `ec-1`, preliminary `INCONCLUSIVE`, deadline
   2026-10-07 04:22:26 UTC.
2. Production contract, dispute `ec-1`, preliminary `CLAIMANT`, deadline
   2026-10-07 04:42:50 UTC (05:42:50 Africa/Lagos). It is visible at
   `https://crossbench-app.vercel.app/disputes/ec-1`.

The production run completed create, exact counter-stake, respondent evidence,
real independent validator fetch/consensus, index synchronization, and canonical
frontend visibility in 76.66 seconds. The contract still reports
`PRELIMINARY_VERDICT` and `can_finalize=false` because the real 48-hour challenge
window has not expired.

The user explicitly authorized unattended post-deadline finalization, settlement,
and withdrawals for the deterministic test wallets. The app displayed an
automation confirmation card for a start at 2026-10-07 04:50 UTC (05:50 Lagos).
Do not claim the automation is active unless the card is confirmed. The resume
test is idempotent:

```bash
gltest contracts/tests/integration/test_lifecycle.py \
  -m deadline --network studionet -s -vv
```

It must finalize both state files, withdraw each non-zero credit with the correct
wallet, verify `accounting_balanced`, force the production index refresh, and
confirm the canonical page says `SETTLED`.

## Verified design decisions

- Contract logic, not backend logic, controls every protocol transition and GEN.
- Backend GenLayer access is read-only and contains no private key.
- Every validator runs the same fetch-and-assess function independently.
- Consensus compares exact `supports` and exact payout-critical `relevance`.
  `reason_code` is leader-authored informational context only.
- Unreachable sources normalize to `NEITHER`/`LOW`.
- URL validation rejects credentials and literal internal/private targets. DNS
  rebinding defense after resolution depends on GenLayer's fetch sandbox.
- Settlement uses integer arithmetic and maintains the accounting invariant.
- Frontend does not update on `ACCEPTED`; it waits for `FINALIZED` plus successful
  execution, then forces a live read.
- All applicable windows have one-second UI countdowns and locally expire action
  buttons; contract time remains authoritative.
- Successfully finalized actions disable immediately to prevent repeat clicks.
- Autofill is structurally valid but explicitly fictional; generic context pages
  may correctly yield an inconclusive verdict.
- OAuth/social account linking was removed from source, UI, configuration,
  compiled output, and schema. Migration `0004` drops its legacy table.

## Backend hardening

- PostgreSQL rate/RPC counters are single-statement atomic upserts.
- A shared PostgreSQL advisory lock coordinates index polls across both Fly
  machines; forced refresh waits and scheduled overlap skips.
- Refresh sessions are opaque hashed tokens and rotate with one consume/replace
  statement. Access JWTs last 15 minutes and refresh one minute early.
- Production SIWE nonce, verify, and refresh returned HTTP 200 from the canonical
  origin. CORS allowed credentials; cookie flags were `HttpOnly`, `Secure`,
  `SameSite=None`, `Path=/auth`; refresh rotated the cookie.
- Runtime startup fails closed for missing database, secrets, origin, RPC, chain,
  or contract address.
- Cleanup runs hourly under an advisory lock.
- Operational events cover indexer errors, RPC exhaustion, validator failures,
  stuck finality, and cleanup failures.

## Latest verification baseline

- Contract direct suite: 18 passing.
- Backend suite: 10 passing; typecheck and build passing.
- Frontend suite: 7 passing; typecheck, ESLint, and webpack build passing.
- Backend and frontend `npm audit --audit-level=low`: zero vulnerabilities.
- Real production consensus test: passing.
- Canonical root and `/disputes/ec-1`: HTTP 200.

Re-run the complete gates immediately before every commit/deploy. Update this
baseline only from actual command output.

## Known operational constraints

- StudioNet can be slow or transiently return TLS/RPC errors. Write retries must
  check the on-chain postcondition before rebroadcasting.
- The official Python path previously needed a localhost-only Node RPC relay for
  one TLS environment; the latest production-visible run succeeded directly.
- GenLayer contracts are immutable. A redeploy creates empty state, so never
  switch addresses while unresolved stakes exist without an explicit migration
  plan.
- Vercel automatically reintroduces a project alias during production deploys.
  Always assign the canonical alias and remove every other Crossbench alias.

## Next required action

After both challenge deadlines, complete the authorized deadline lifecycle and
replace the preliminary state in both JSON files and audit documentation with
transaction-backed settlement/withdrawal evidence. Only then can the overarching
hardening goal be marked complete.
