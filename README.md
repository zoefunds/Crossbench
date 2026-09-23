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
backend/      Cloudflare Workers API (Hono) - SIWE auth, D1 index, indexer
frontend/     Next.js app - Reown AppKit wallet connect, DESIGN.md tokens
```

## Live deployments

- Frontend: https://crossbench-app.vercel.app
- Backend API: https://crossbench-api.preciousmofeoluwa.workers.dev
- Intelligent Contract (StudioNet): `0x6F1CeE0a07953EC2EE18b4d9DE36aB010Abc10d2` - see `CONTRACT_DEPLOYMENT.md` for how to redeploy and rewire your own instance

See `ARCHITECTURE.md` for the full system design and trust-boundary
rationale, `MEMORY.md` for build status and everything learned along the
way (**read this first** in a new session - it documents three real bugs
found via real-network testing, not just lint), and
`CONTRACT_DEPLOYMENT.md` for deploying the contract yourself and wiring the
address in.

## Discovery questionnaire - answers on record

| Question | Answer |
|---|---|
| Backend stack | Cloudflare Workers + D1 (no Fly, no Postgres - migrated mid-build at explicit instruction) |
| Authentication | External wallet connect (Reown AppKit: MetaMask/Rainbow/Zerion) + SIWE. Wallet-connected alone is never authentication. |
| Dispute scope (v1) | Narrow: moderation-appeal reference case, contract stays generic |
| Evidence bundle cap | 3 items per party, web pages + on-chain references only |
| Counter-stake | Required to proceed; claimant wins by default on timeout otherwise |
| Challenge window | Fixed 48 hours, additive evidence only |
| Contract deployment | User deploys via GenLayer Studio/CLI - not automated here |
| Frontend host | Vercel |
| Backend host | Cloudflare Workers |

## Quick start (local dev)

```bash
# Contract
genvm-lint check contracts/crossbench_contract.py --json
pytest contracts/tests/direct/ -q

# Backend
cd backend && npm install && npx wrangler dev

# Frontend
cd frontend && npm install && npm run dev
```
