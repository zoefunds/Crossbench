# Deploying the Crossbench Intelligent Contract

You deploy the contract yourself - this is deliberate (see MEMORY.md). Once
deployed, give the address back and it gets wired into the backend and
frontend config.

## 1. Deploy via GenLayer Studio / CLI

The contract lives at `contracts/crossbench_contract.py`. It has no
constructor arguments.

```bash
genlayer deploy --contract contracts/crossbench_contract.py --network studionet
```

(Use whatever the current GenLayer CLI deploy command is for your installed
version - verify against `genlayer --help` / current docs, since CLI flags
change between releases.)

Before deploying, re-run the checks that already passed in this repo, to
confirm nothing has drifted:

```bash
genvm-lint check contracts/crossbench_contract.py --json
pytest contracts/tests/direct/ -q
```

## 2. Wire the deployed address in

### Backend (Cloudflare Worker)

```bash
cd backend
npx wrangler secret put CONTRACT_ADDRESS
# paste the deployed address when prompted
```

### Frontend (Next.js / Vercel)

Set `NEXT_PUBLIC_CONTRACT_ADDRESS` to the deployed address:
- Locally: add it to `frontend/.env.local`
- On Vercel: `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS`

## 3. Verify the wiring

```bash
curl https://<your-worker>.workers.dev/stats
```

Should return real contract stats (`total_disputes`, `accounting_balanced`,
etc.), not `{"configured": false}`.

Then open the deployed frontend, connect a wallet with testnet GEN, and open
a test dispute end to end.
