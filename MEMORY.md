# Crossbench current operational memory

## Production state

- Frontend: <https://crossbench-app.vercel.app/> only.
- Backend: <https://crossbench-api.fly.dev/>; both `ams` machines healthy.
- StudioNet contract: `0x2352A0cBF175F1e69eBc8364A35301570378FF22`.
- Deployment transaction: `0xea3fee2c375a3cf676f49431a1019332d476d1f356e73f5b7621ab2f5a5e2322`.
- Production contract version: `0.3.1-studionet`.
- Vercel deployment: `dpl_3iHiVaxMdhxQwmdgCYJs69PbpQn6`.
- Fly image: `crossbench-api:deployment-01M45665XWTWC0N8JM5034PW9M`;
  both version-25 `ams` machines are started with passing checks.
- Fly secret is `CONTRACT_ADDRESS`; frontend variable is
  `NEXT_PUBLIC_CONTRACT_ADDRESS`. Both were cut over on 2026-10-07.

## Source verification behavior

- Public HTTPS policy and evidence URLs are fetched independently by validators.
- The wallet-signed claimant binds one intended respondent at creation; only
  that wallet may accept and counter-stake.
- Every policy names its issuer and must be unanimously `PRIMARY` before any
  evidence can move value.
- On-chain sources carry chain, object type, and object identity fields;
  validators compare those fields with fetched ledger data and the contract
  deduplicates the same object across different explorers.
- Provenance is classified `UNVERIFIED`, `CORROBORATED`, or `PRIMARY`.
- `UNVERIFIED` evidence remains auditable but contributes zero verdict weight.
- Canonically equivalent URLs are rejected; same-content duplicates are
  detected after fetching and cannot add weight.
- Content hashes are stored for mutation/audit detection, not used as brittle
  whole-page equality gates between validators.
- Consensus tolerates bounded adjacent relevance/provenance judgments, but not
  opposing support or verified-vs-unverified disagreement.
- Autofill covers every category and supplies complete creation, respondent,
  and unique per-party challenge bundles. All 20 referenced public sources
  returned HTTP 200 during the 2026-10-07 verification.

## Live proof and pending deadline work

Production `ec-1` used real Ethereum Foundation policy/history pages and a
Blockscout on-chain reference. It reached `PRELIMINARY_VERDICT`; policy quality
is `PRIMARY`, the structured block reference is `CORROBORATED`, and duplicate
and mutation arrays are empty. Backend fresh indexing and the canonical
frontend both expose it. State is in `docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

Its challenge deadline is `2026-10-09T09:21:10Z`. After that, run the resumable
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
- Current baseline: 34 contract, 10 backend, and 9 frontend tests passing;
  backend/frontend dependency audits report zero vulnerabilities.
- Production 0.3.1 records failures in direct-VM tests, but its first live
  StudioNet assessment did not persist the counter because the failure occurred
  outside the catchable contract frame. A two-phase deterministic attempt
  record remains required. Historical deployments remain immutable.
