# Crossbench

> Both sides submit their proof. Neither side gets to weigh it.

A general-purpose, stake-backed dispute resolution protocol. Two adversarial
parties each stake GEN and submit a bundle of precommitted public evidence
for a specific, falsifiable claim. GenLayer validators - not either party,
not a moderator, not the platform - independently fetch and assess that
evidence to reach a structured verdict, and a deterministic function
distributes the stake accordingly.

Flagship reference scenario: platform moderation appeals. The claim format,
evidence bundles, and verdict structure stay generic enough to also cover
delivery disputes, listing-accuracy disputes, and other two-party factual
disputes.

## Repo layout

```
contracts/    Crossbench Intelligent Contract + direct/integration tests
backend/      Fly.io Node API (Hono) - SIWE auth, PostgreSQL index, indexer
frontend/     Next.js app - Reown AppKit wallet connect, "Lex Cryptographica" theme
docs/         CONTRACT_SPEC.md - full method/state reference for the contract
```

## Live deployments

- Frontend: https://crossbench-app.vercel.app
- Backend API: Fly.io deployment (hostname is assigned during `fly launch`)
- Intelligent Contract (StudioNet): `0xE8820FB49D6b2e5984Bc8F70762bbB659FbA221c` - see `CONTRACT_DEPLOYMENT.md` for how to redeploy and rewire your own instance

See `ARCHITECTURE.md` for the full system design and trust-boundary
rationale, `docs/CONTRACT_SPEC.md` for the contract's full method/state
spec, `MEMORY.md` for build status and everything learned along the way
(**read this first** in a new session - it documents multiple real bugs
found via real-network and real-wallet testing, not just lint), and
`CONTRACT_DEPLOYMENT.md` for redeploying the contract and rewiring the
address.

## Discovery questionnaire - answers on record

| Question | Answer |
|---|---|
| Backend stack | Node/Hono on Fly.io + PostgreSQL |
| Authentication | External wallet connect (Reown AppKit - surfaces MetaMask, WalletConnect, Trust Wallet, Binance Wallet, SafePal, and 80+ more) + SIWE. Wallet-connected alone is never authentication. |
| Dispute scope (v1) | Narrow: moderation-appeal reference case, contract stays generic |
| Evidence bundle cap | 3 items per party (2 more for challenge evidence), web pages + on-chain references only |
| Counter-stake | Required to proceed; claimant wins by default on timeout otherwise |
| Challenge window | Fixed 48 hours, additive evidence only - originals are immutable |
| Contract deployment | Claude deploys directly via the `genlayer` CLI, per explicit user instruction ("deploy the address yourself") - see `CONTRACT_DEPLOYMENT.md` |
| Frontend host | Vercel |
| Backend host | Fly.io |
| RPC budget | Backend enforces a 4,000-request daily ceiling, with coalesced 30-second polling and cached detail reads |

See `docs/CONTRACT_SPEC.md` for the full method/state spec of the
Intelligent Contract.

## Quick start (local dev)

```bash
# Contract
genvm-lint check contracts/crossbench_contract.py --json
pytest contracts/tests/direct/ -q

# Backend
cd backend && npm install && npm run dev

# Frontend - see frontend/README.md if you hit a Node version issue
# (the repo's .claude/launch.json / scripts/dev-frontend.sh already
# work around an nvm-vs-Homebrew Node conflict seen in this environment)
cd frontend && npm install && npm run dev
```

### Environment variables

**Backend** (Fly secrets for production, `.env` for local development)
for the rest):

| Variable | Purpose |
|---|---|
| `CONTRACT_ADDRESS` (secret) | Deployed Intelligent Contract address. Unset until deployed - `isContractConfigured()` gates all contract-touching routes. |
| `GENLAYER_NETWORK`, `GENLAYER_RPC_URL` | StudioNet network/RPC endpoint |
| `GENLAYER_RPC_MAX_REQUESTS_PER_DAY` | Read-side RPC budget ceiling (currently `4000`, below the 5000/day quota) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` (secret) | Signs SIWE session access/refresh tokens |
| `INTERNAL_SECRET` (secret) | Protects `POST /internal/reindex`, the manual indexer-refresh escape hatch |

**Frontend** (`frontend/.env.local` locally, Vercel env vars in prod):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed Intelligent Contract address |
| `NEXT_PUBLIC_API_URL` | Fly backend URL (defaults to `https://crossbench-api.fly.dev`) |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown/WalletConnect project ID for wallet connect |
| `NEXT_PUBLIC_APP_URL` | Canonical frontend URL, used in wallet-connect metadata |
