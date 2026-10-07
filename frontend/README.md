# Crossbench frontend

Production: <https://crossbench-app.vercel.app/>. This is the only supported
frontend URL. Generated Vercel project aliases must be removed after deployment.

## Stack

- Next.js `16.3.6`, React `19.2.8`
- wagmi `3.7.7`, viem `2.56.8`, Reown AppKit `1.8.24`
- `genlayer-js` `1.1.8`
- Tailwind CSS 4

There is no OAuth/social login. Reown only connects wallets; SIWE authentication
is a separate signed-message flow to Fly.

## Trust boundary and writes

All protocol writes are direct wallet-signed contract transactions. The backend
only authenticates, serves indexed/live reads, and stores telemetry. `lib/tx.ts`
does not report success at `ACCEPTED`: it waits for `FINALIZED`, checks the leader
execution receipt, disables the action, then forces a live read.

Pass `connector.getProvider()` (raw EIP-1193) to GenLayer. Do not substitute
wagmi's wrapped viem transport. Use the complete `studionet` chain export from
`genlayer-js/chains`, including consensus-specific fields.

## Key files

```text
app/disputes/page.tsx                     list + countdowns
app/disputes/new/page.tsx                 create/stake + autofill
app/disputes/[id]/page.tsx                live detail/polling
app/disputes/[id]/DisputeActions.tsx      all party contract actions
app/disputes/[id]/EvidenceAssessment.tsx  consensus and explanation labels
app/profile/page.tsx                      wallet disputes/deadlines
app/settings/page.tsx                     SIWE session only
components/DeadlineCountdown.tsx          one-second deadlines
components/EvidenceBundleEditor.tsx       contract-aligned URL/text validation
lib/api.ts                                read-through calls + forced refresh
lib/auth.ts                               SIWE and access-token refresh
lib/exampleData.ts                        contract-complete lifecycle demonstrations
lib/genlayer.ts                           wallet-backed GenLayer client
lib/operations.ts                         non-blocking telemetry
lib/tx.ts                                 finalized-only write flow
```

Autofill cycles through all four claim categories. It supplies a valid intended
respondent different from the connected claimant, a first-party policy URL and
matching issuer, and a contract-valid claimant bundle. Respondent and challenge
forms select distinct evidence for the category, avoiding cross-party URL and
ledger-object duplication. The factual example includes `chain_id`, object
type, and the full Ethereum genesis-block hash. Public pages provide context
but do not prove fictional events, so an `INCONCLUSIVE` result remains valid.

## Environment

```dotenv
NEXT_PUBLIC_CONTRACT_ADDRESS=0x2352A0cBF175F1e69eBc8364A35301570378FF22
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_REOWN_PROJECT_ID=<project-id>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Production values use the HTTPS URLs in the root README. Public values are
inlined at build time, so every change requires redeployment.

## Verify

```bash
cd frontend
npm ci
npm test
npm run typecheck
npm run lint
npm run build:webpack
npm audit --audit-level=low
```

Vercel uses the default Turbopack build. The webpack script is a local fallback
for restricted environments where Turbopack cannot bind an internal worker port.

## Deploy

```bash
vercel --prod --yes
vercel alias set <deployment-host> crossbench-app.vercel.app
vercel alias rm <generated-project-alias> --yes
curl -fsS -o /dev/null -w '%{http_code}\n' https://crossbench-app.vercel.app/
```

Verify the canonical root and a live dispute page. Vercel-managed deployment
hostnames may exist, but only the canonical origin is used for published links,
SIWE, and backend CORS.

The “Lex Cryptographica” Tailwind 4 theme lives in `app/globals.css`. Reown's
third-party modal only approximates it. Preserve explicit grid column classes;
for flex-row truncation, use `min-w-0` plus a remaining-width strategy.
