# Crossbench

Crossbench is a stake-backed, two-party dispute protocol on GenLayer StudioNet.
Each party pins public evidence, independent GenLayer validators fetch and assess
every source, and the Intelligent Contract deterministically converts the
consensus result into settlement credits. The application backend cannot create,
accept, evaluate, settle, or withdraw a dispute.

## Production

| Component | Production value |
|---|---|
| Frontend | <https://crossbench-app.vercel.app/> (the only supported frontend URL) |
| Read-only API | <https://crossbench-api.fly.dev/> |
| Network | GenLayer StudioNet, chain ID `61999` |
| Intelligent Contract | `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` |
| Deployment transaction | `0x994141b9b4131b0b1abc1cc38870256bd9acdc87f0a4ef37cdf4460f0e56450d` |
| Contract runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |

The production contract currently contains two explicitly labelled test
disputes from the 2026-10-06 cutover verification: `ec-1` reached
`PRELIMINARY_VERDICT` through real validator consensus and is in its
genuine 48-hour challenge window; `ec-2` was cancelled and its stake
withdrawn, exercising the refund-workflow fix end to end.

## Repository

```text
contracts/  Intelligent Contract and direct/StudioNet integration tests
backend/    Node 22 + Hono API, PostgreSQL mirror, SIWE sessions, indexer
frontend/   Next.js 16 UI, wallet connection, direct contract writes
docs/       Contract specification, audit evidence, lifecycle state, rollback runbook
```

Authoritative documentation:

- `ARCHITECTURE.md` — components, trust boundaries, data flow, and security.
- `docs/CONTRACT_SPEC.md` — exact contract methods, limits, lifecycle, and settlement.
- `CONTRACT_DEPLOYMENT.md` — deploy, cut over, verify, and recover a contract address.
- `docs/AUDIT_2026-10-05.md` — findings, tests, and real-network evidence.
- `docs/ROLLBACK_CUTOVER.md` — backend/frontend/contract cutover and rollback.
- `MEMORY.md` — concise current operational state for the next maintainer.

## Protocol lifecycle

1. The claimant calls `create_dispute` with 0.001–10 GEN and an immutable
   evidence bundle (one to three items).
2. A different wallet calls `accept_dispute` before the 24-hour response
   deadline and counter-stakes exactly the same amount.
3. The respondent pins one to three evidence items before the 72-hour evidence
   deadline. The claimant's original bundle was already pinned at creation.
4. Anyone calls `trigger_evaluation` when both bundles are ready (or after the
   evidence deadline). Every validator independently fetches the policy and
   every public HTTPS source, verifies provenance, and assesses support and
   relevance. Unverified or duplicate material cannot add verdict weight.
5. The preliminary verdict opens a 48-hour challenge window. Each party may add
   up to two immutable evidence items once.
6. After the deadline, anyone may call `finalize_dispute`. Challenge evidence,
   if present, causes a new validator assessment; settlement itself is
   deterministic contract logic.
7. Each credited party calls `withdraw_credit` from the wallet that owns the
   credit. The backend never participates in value movement.

## Security and trust boundary

- All state transitions, deadlines, authorization, evidence immutability,
  validator consensus, payout math, credits, and withdrawals live in the
  contract.
- The Fly backend has no signer or private key and only performs contract reads.
- Policy and evidence references must be public HTTPS URLs. Credentials, localhost/`.local`, private,
  loopback, link-local, reserved, and unspecified literal IPs are rejected.
  DNS-resolution-time private-address blocking remains the responsibility of the
  GenLayer web-fetch sandbox.
- Validators compare judgments with bounded compatibility: adjacent relevance
  and provenance grades are tolerated, but opposing support, materially
  conflicting provenance, fetched-content drift, and inconsistent duplicate
  mappings fail consensus. `reason_code` is explanatory context only.
- The UI reports success only after `FINALIZED` and a successful leader receipt;
  `ACCEPTED` is informational.

## Local verification

Requirements: Node.js 22+, npm, Python with `gltest`, and the GenLayer tooling
used by this repository.

```bash
# Contract
pytest contracts/tests/direct/ -q
GENVM_VERSION=v0.2.16 genvm-lint check contracts/crossbench_contract.py --json

# Backend
cd backend
npm ci
npm test
npm run typecheck
npm run build
npm audit --audit-level=low

# Frontend
cd ../frontend
npm ci
npm test
npm run typecheck
npm run lint
npm run build:webpack
npm audit --audit-level=low
```

Real StudioNet tests cost quota and can take minutes:

```bash
gltest contracts/tests/integration/test_lifecycle.py \
  -k production_visible_lifecycle --network studionet -s -vv
```

The deadline-resume test is idempotent and reads the durable files in `docs/`.
It skips safely until the recorded challenge deadline has passed.

## Runtime configuration

Backend startup fails if a required value is missing or malformed:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs 15-minute SIWE access JWTs; minimum 32 characters |
| `INTERNAL_SECRET` | Protects internal routes; minimum 24 characters |
| `CONTRACT_ADDRESS` | Production Intelligent Contract address |
| `GENLAYER_RPC_URL` | HTTPS StudioNet JSON-RPC endpoint |
| `GENLAYER_CHAIN_ID` | `61999` |
| `GENLAYER_RPC_MAX_REQUESTS_PER_DAY` | Backend read budget; production uses `4000` |
| `APP_ORIGIN` | Exactly `https://crossbench-app.vercel.app` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional Redis budget backend; PostgreSQL is the atomic fallback |

Frontend public build variables:

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Same production address as the backend |
| `NEXT_PUBLIC_API_URL` | `https://crossbench-api.fly.dev` |
| `NEXT_PUBLIC_GENLAYER_CHAIN_ID` | `61999` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | Browser-facing StudioNet RPC endpoint |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown WalletConnect project identifier |
| `NEXT_PUBLIC_APP_URL` | `https://crossbench-app.vercel.app` |

No OAuth or social-account linking exists in the current product.
