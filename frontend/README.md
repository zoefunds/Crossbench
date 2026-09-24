# Crossbench frontend

Next.js 16 (App Router, Turbopack) app for Crossbench, a stake-backed
dispute resolution protocol on GenLayer. See the repo root `README.md` and
`ARCHITECTURE.md` for the full system picture - this file only covers the
frontend.

Every write (create dispute, accept, submit evidence, submit challenge
evidence, finalize, withdraw) is a direct client-side transaction signed
by the user's own connected wallet straight to the Intelligent Contract.
This app never brokers a write - the Cloudflare Workers backend
(`../backend/`) is a read-only index for fast list/detail views, with a
read-through fallback to a live contract read.

## Stack

- **Next.js 16**, App Router, Turbopack
- **wagmi v2 + viem** for wallet/chain plumbing
- **Reown AppKit** (`@reown/appkit`) for the wallet-connect UI, wired to
  `genlayer-js`'s own `studionet` chain object (`genlayer-js/chains`) -
  not a hand-rolled one. A partial chain definition (missing GenLayer-
  specific fields like `consensusMainContract`) causes a real
  `Cannot convert undefined to a BigInt` crash on wallet writes; this was
  hit and fixed once already, see `../MEMORY.md`.
- **genlayer-js** for reading/writing the Intelligent Contract
- **Tailwind CSS v4** (CSS-based theme via `app/globals.css`'s
  `@theme inline` block - there is no `tailwind.config.js`)

## Local dev

The dev server needs the Homebrew Node install, not whatever `nvm` sets as
default in this environment (a prior version mismatch broke `next dev`
silently). Two equivalent ways to run it:

```bash
# via the repo's launch config (what the built-in browser preview tool uses)
# see ../.claude/launch.json -> scripts/dev-frontend.sh

# or directly:
cd frontend
npm install
../scripts/dev-frontend.sh   # forces Homebrew's node onto PATH first
```

Plain `npm run dev` works too as long as your shell's default `node` is
already the Homebrew one.

## Environment variables

Copy into `frontend/.env.local` for local dev (see root `README.md` for
the same table with descriptions):

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x6F1CeE0a07953EC2EE18b4d9DE36aB010Abc10d2
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_REOWN_PROJECT_ID=<your Reown/WalletConnect project id>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`NEXT_PUBLIC_*` vars are inlined at **build time**, not read at runtime -
changing one in the Vercel dashboard does nothing to an already-built
deployment. Redeploy after changing them (see `../CONTRACT_DEPLOYMENT.md`).

## Structure

```
app/
  page.tsx                    Landing page
  layout.tsx                  Root layout, fonts (Hanken Grotesk + JetBrains Mono), NavBar mount
  globals.css                 Full design-token theme (colors, type scale, spacing) - see below
  disputes/page.tsx           Dispute list (read-through from the backend)
  disputes/new/page.tsx       Dispute creation form + wallet write
  disputes/[id]/page.tsx      Dispute detail (live contract read + polling)
  disputes/[id]/DisputeActions.tsx      All party actions (accept, submit evidence, challenge, finalize, withdraw)
  disputes/[id]/EvidenceAssessment.tsx  Per-item validator assessment display
  profile/page.tsx            Caller's own disputes + withdrawable credit
  settings/page.tsx           SIWE session + social-connection management
components/
  NavBar.tsx, Logo.tsx, StatusBadge.tsx, WalletConnectButton.tsx,
  TxStatus.tsx, EvidenceBundleEditor.tsx, Providers.tsx (wagmi/AppKit/React Query setup)
lib/
  wagmi.ts       Chain + wagmi adapter config (genlayer-js's studionet chain, not hand-rolled)
  genlayer.ts    useGenLayerClient() hook - bridges the wallet's raw EIP-1193
                 provider (connector.getProvider(), not wagmi's wrapped
                 viem client) into a genlayer-js client
  tx.ts          runWrite() - real tx lifecycle tracking via the SDK's own
                 receipt/consensus_data, with retry-with-backoff for
                 StudioNet's eth_sendRawTransaction rate limiting
  api.ts         Backend REST client (fetchDisputes, fetchDispute, ...)
  auth.ts        SIWE session hook
  exampleData.ts Real example dispute data ("Fill example data" buttons) - not fake/dummy data, a complete moderation-appeal scenario with real reference URLs
```

## Design system

"Lex Cryptographica" - a dark "Cryptographic Institutionalism" theme
(obsidian surfaces, electric cyan primary `#4cd7f6`, amber secondary
`#ffb95f`, Hanken Grotesk for prose, JetBrains Mono for
hashes/addresses/data). Implemented entirely as CSS custom properties in
`app/globals.css`'s `@theme inline` block (Tailwind v4's CSS-first theming
- there's no `tailwind.config.js` to edit). Token *names* are semantic and
stable (`--color-navy`, `--color-cyan`, `--color-purple`, `--color-text-ec`,
`--color-text-dim`, `--color-border-ec`, ...) - `purple` is a legacy name
that now carries the amber "secondary" accent, kept as-is rather than
renamed across every call site. Utility classes built on those tokens:
`.glass-card`, `.glass-card-ai`, `.label-sm`, `.data-mono`, `.glow-active`,
`.glow-stake`.

A known cosmetic gap: the Reown AppKit *connect modal itself* uses its own
internal theming (`themeMode`/`themeVariables` passed to `createAppKit()`
in `Providers.tsx`) which approximates but doesn't exactly match our
palette - the connect *button* was rebuilt from scratch on the public
`useAppKit`/`useAppKitAccount` hooks specifically to get pixel-exact
theming, but the modal Reown renders when you open it is still theirs.

## Known layout gotchas (already fixed once, don't reintroduce)

- A bare `grid` class with no `grid-cols-N` sizes its implicit track to
  the unconstrained max-content width of its children, not its container -
  always pair `grid` with an explicit `grid-cols-N` (or `sm:grid-cols-N`
  etc.) in this codebase.
- `truncate` inside a flex row needs `min-w-0` **and** `flex-1` on the
  truncating element (or an equivalent way to claim the remaining space) -
  `min-w-0` alone is not sufficient for reliable ellipsis truncation.
