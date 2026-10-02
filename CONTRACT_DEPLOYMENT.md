# Deploying the Crossbench Intelligent Contract

The project's original default was that the user deploys the contract
themselves. That was explicitly overridden: the user said "deploy the
address yourself," so Claude now deploys directly via the `genlayer` CLI
when a (re)deploy is needed, then wires the resulting address into the
backend and frontend config itself. This doc describes that actual
workflow, not the original user-deploys default.

**Current live address (StudioNet):** `0xE8820FB49D6b2e5984Bc8F70762bbB659FbA221c`
(also recorded in `README.md`). Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

Redeploy whenever the contract source changes in a way that needs a fresh
address (GenLayer contracts aren't upgradeable in place) - this has
happened several times already for real bug fixes (see `MEMORY.md` for the
BigInt-serialization and consensus-agreement fixes that each required a
redeploy).

## 1. Deploy via the GenLayer CLI

The contract lives at `contracts/crossbench_contract.py`. It has no
constructor arguments.

```bash
genlayer deploy contracts/crossbench_contract.py --network studionet
```

(Verify the exact flags against `genlayer --help` for your installed CLI
version before relying on the command above verbatim - GenLayer CLI flags
have changed between releases during this project.)

Before deploying, re-run the checks that already passed in this repo, to
confirm nothing has drifted:

```bash
genvm-lint check contracts/crossbench_contract.py --json
pytest contracts/tests/direct/ -q
```

## 2. Wire the deployed address in

### Backend (Fly.io)

```bash
cd backend
fly secrets set CONTRACT_ADDRESS=0xYourContractAddress
# paste the deployed address when prompted
```

### Frontend (Next.js / Vercel)

Set `NEXT_PUBLIC_CONTRACT_ADDRESS` to the deployed address:
- Locally: add it to `frontend/.env.local`
- On Vercel: `vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production` (if one
  is already set) then `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production`

`NEXT_PUBLIC_*` vars are baked in at build time, not read at runtime - a
Vercel env var change alone does **not** update the already-deployed site.
After changing it, redeploy: `vercel deploy --prod` from `frontend/`, then
repoint the canonical alias since Vercel does not do this automatically on
promote:

```bash
vercel alias set <new-deployment-url> crossbench-app.vercel.app
```

## 3. Verify the wiring

```bash
curl https://<your-fly-app>.fly.dev/stats
```

Should return real contract stats (`total_disputes`, `accounting_balanced`,
etc.), not `{"configured": false}`.

Then open the deployed frontend, connect a wallet with testnet GEN, and open
a test dispute end to end.
