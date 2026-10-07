# Crossbench current operational memory

## Production state

- Frontend: <https://crossbench-app.vercel.app/> only.
- Backend: <https://crossbench-api.fly.dev/>; both `ams` machines healthy.
- StudioNet contract: `0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6`.
- Deployment transaction: `0x231b7a38b08d58fed9fb7037960e56a89de74098b03588651e5c5232b143573e`.
- Source commit: `4c94dc2`; contract version `0.2.0-studionet`.
- Vercel deployment: `dpl_FGSxpUGrrKhjvyWZan136yEEDKEX`.
- Fly secret is `CONTRACT_ADDRESS`; frontend variable is
  `NEXT_PUBLIC_CONTRACT_ADDRESS`. Both were cut over on 2026-10-07.

## Source verification behavior

- Public HTTPS policy and evidence URLs are fetched independently by validators.
- Provenance is classified `UNVERIFIED`, `CORROBORATED`, or `PRIMARY`.
- `UNVERIFIED` evidence remains auditable but contributes zero verdict weight.
- Canonically equivalent URLs are rejected; same-content duplicates are
  detected after fetching and cannot add weight.
- Content hashes are stored for mutation/audit detection, not used as brittle
  whole-page equality gates between validators.
- Consensus tolerates bounded adjacent relevance/provenance judgments, but not
  opposing support or verified-vs-unverified disagreement.

## Live proof and pending deadline work

Production `ec-1` used real Ethereum Foundation policy/history pages and a
Blockscout on-chain reference. It reached `PRELIMINARY_VERDICT`; policy quality
is `PRIMARY`, the unavailable explorer page is `UNVERIFIED`, and duplicate and
mutation arrays are empty. Backend fresh indexing and the canonical frontend
both expose it. State is in `docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

Its challenge deadline is `2026-10-09T07:34:50Z`. After that, run the resumable
deadline integration to finalize and withdraw both test credits. Superseded
contract escrows and their limits are fully inventoried in
`docs/ESCROW_RECOVERY.md`.

## Operational constraints

- The backend is read-only and has no signer/private key.
- Contract address changes require coordinated Fly secret update, Vercel env
  update plus rebuild, and a forced backend reindex.
- Vercel production deploys add generated aliases; assign the canonical alias
  and remove duplicates.
- StudioNet writes must be retried only after checking the on-chain
  postcondition.
- Use `GENVM_VERSION=v0.2.16` for semantic validation in this environment.
