# Crossbench architecture

## Production topology

```text
User wallet
  │ direct signed writes + GEN value
  ▼
GenLayer StudioNet Intelligent Contract
  │ independent validator web fetch + consensus
  │ authoritative state, escrow, settlement credits
  ▲
  │ readContract only
Fly.io Node/Hono API (2 machines)
  │ PostgreSQL advisory locks, atomic counters, disposable index
  ▼
PostgreSQL

Browser ── HTTPS credentialed reads/SIWE ──► Fly API
Browser ── rendered UI ────────────────────► Vercel canonical deployment
```

Production endpoints and identifiers are listed in `README.md`.

## Contract boundary

`contracts/crossbench_contract.py` is the sole protocol authority. It enforces
stake limits, exact counter-stake, party authorization, every deadline, evidence
immutability, validator consensus, deterministic settlement, accounting, and
owner-only withdrawal.

Every validator fetches every evidence source inside its own execution. Neither
the backend nor either party supplies fetched content, scores, or verdicts.
Unreachable sources normalize to `NEITHER`/`LOW`. `reason_code` is explanatory
leader output, excluded from agreement and money movement.

## Backend

The backend uses Node.js 22, Hono, `genlayer-js` 0.9.x, and PostgreSQL. It has no
contract signer or private key and exports no contract write operation. The
ephemeral account in its client only forces the SDK onto the fetch-based RPC path.

Responsibilities:

- SIWE verification bound to canonical origin, chain, nonce, and issuance time;
- 15-minute access JWTs plus opaque 30-day refresh sessions stored as hashes;
- credentialed CORS for exactly `https://crossbench-app.vercel.app`;
- live/read-through dispute and stats endpoints;
- a disposable PostgreSQL contract mirror;
- endpoint and daily RPC-budget enforcement;
- operational-event persistence and expired-data cleanup.

Each Fly machine starts a two-minute poll loop. `pollOnce` takes the shared
PostgreSQL advisory lock `crossbench:indexer`: scheduled contenders try and skip,
while forced post-finality refreshes wait. A process-local promise coalesces
overlap on one machine.

The PostgreSQL RPC fallback increments through one atomic `INSERT ... ON
CONFLICT DO UPDATE ... RETURNING count` statement. Upstash `INCR` is used only
when both optional credentials exist. Either exhaustion path records telemetry.

Hourly cleanup uses a separate advisory lock and removes expired refresh
sessions, expiring SIWE nonce records, old counters, and operational events over
30 days old. OAuth state is absent because OAuth/social linking was removed.

## Frontend

The frontend uses Next.js 16.3.6, React 19.2, wagmi 3.7, viem 2.56, Reown AppKit
1.8, and `genlayer-js` 1.1.8. The connector's raw EIP-1193 provider is passed to
GenLayer; wagmi's wrapped viem transport is not compatible with that SDK API.

Every protocol write originates in the browser. `runWrite` shows `ACCEPTED` as
progress, then waits for `FINALIZED` and verifies
`leader_receipt.execution_result === "SUCCESS"` before any success handler or
refresh. Completed actions disable immediately and force a `fresh=1`, `no-store`
read.

Response, evidence, and challenge deadlines render to the second on list,
detail, and profile surfaces. Local expiry disables actions; contract time is
authoritative. Autofill examples are structurally valid fictional scenarios and
may correctly produce an inconclusive result.

## PostgreSQL model

| Table | Purpose |
|---|---|
| `users` | Wallet login timestamps |
| `sessions` | Hashed opaque refresh sessions |
| `kv_store` | Expiring SIWE nonces |
| `siwe_nonces` | Legacy nonce rows retained for cleanup compatibility |
| `disputes` | Indexed summaries and raw contract views |
| `evidence_items` | Original/challenge evidence mirror |
| `verdicts` | Preliminary/final assessment mirror |
| `indexer_state` | Contract address and count watermark |
| `rate_limit_counters` | Atomic endpoint and RPC counters |
| `operational_events` | Indexer, budget, finality, validator, cleanup alerts |

On an address change the indexer clears only contract-derived mirror tables and
rebuilds from the new deployment. Authentication data remains intact.

## Operational telemetry

- `INDEXER_FAILURE`: poll or detail-refresh failure.
- `RPC_BUDGET_EXHAUSTED`: daily budget rejection from either counter backend.
- `VALIDATOR_FAILURE`: finalized write with failed execution.
- `TX_FINALITY_STUCK`: accepted write still unfinalized after two minutes.
- `CLEANUP_FAILURE`: scheduled cleanup error.

Client reports contain only a validated hash and function name, are rate-limited,
and cannot influence protocol state.

## Security limitations

- Literal internal/private IP targets and URL credentials are rejected. DNS
  rebinding protection depends on GenLayer's fetch sandbox checking resolved
  addresses; application code cannot control validator infrastructure DNS.
- Exact relevance agreement protects payout integrity but can reduce liveness.
  Production dispute `ec-1` completed one real consensus run in 76.66 seconds;
  that is evidence of a successful path, not a universal liveness guarantee.
- StudioNet is a test network and GEN here is testnet value.

## Ownership

- Backend: Fly app `crossbench-api`, two `ams` machines, rolling deployment.
- Frontend: Vercel project `crossbench`; only the canonical alias is supported.
- Source: GitHub `zoefunds/Crossbench`, branch `main`.

See `docs/ROLLBACK_CUTOVER.md` for operational procedures.
