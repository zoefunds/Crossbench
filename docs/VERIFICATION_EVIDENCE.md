# Verification evidence

Last verified: 2026-10-07. Production version: `0.3.1-studionet`.

## Control-to-test map

| Control | Implementation | Evidence |
|---|---|---|
| Wallet-bound parties | `create_dispute` derives claimant from sender and stores a different intended respondent; `accept_dispute` requires that wallet | `test_only_wallet_named_as_intended_respondent_can_accept`; compact lifecycle unauthorized-accept attempt |
| Authoritative policy | Stored `policy_issuer`; independently fetched policy must be unanimously `PRIMARY` before weighted settlement | unverified-policy aggregation tests; live `policy_assessment` |
| Structured ledger evidence | Required `chain_id`, `reference_type`, and `reference_value`; validators check the fetched object | structured-reference direct test; live Ethereum block record |
| Duplicate resistance | Canonical URL, structured-object, and fetched-content checks | URL alias, cross-explorer, and content-duplicate tests |
| Material consensus | Support, relevance, provenance, availability, and duplicate relationships drive agreement; page hashes and explanation text do not | bounded-variance/conflict test |
| Immutable challenge flow | Original bundles cannot be replaced; each party gets one additive bundle of at most two items | lifecycle and duplicate-submission tests |
| Deterministic value movement | Verdict aggregation, settlement, pull credits, and withdrawals are contract logic | payout, accounting, and full lifecycle tests |
| Fixed-window lifecycle | Production constants exercised by advancing direct VM time | `test_compact_complete_authenticated_lifecycle_across_fixed_windows` |
| Transaction finality | UI waits for `FINALIZED` plus successful leader receipt | frontend transaction tests |
| Complete autofill | Four categories, valid non-self respondent, first-party policy, structured on-chain data, distinct challenge items | frontend autofill tests and 20-source HTTP check |

## Automated baseline

```text
contract direct tests     34 passed
GenVM lint/validation     3/3 passed; 14 methods
backend tests             10 passed
frontend tests            9 passed
backend/frontend audits   0 vulnerabilities
```

Backend and frontend typechecks and production builds pass. Frontend ESLint
passes. The local Next build uses webpack when the restricted host prevents
Turbopack from binding an internal worker port; Vercel's production Turbopack
build completed successfully.

## Live evidence

- Contract: `0x2352A0cBF175F1e69eBc8364A35301570378FF22`.
- Deployment consensus: one round, all five validators agreeing.
- Current lifecycle: fresh state, zero disputes and zero escrow.
- Historical live lifecycle: former production `ec-1`,
  `PRELIMINARY_VERDICT`, real 0.1 GEN matched escrow.
- Policy: Ethereum Foundation, `PRIMARY`.
- Ledger object: Ethereum mainnet genesis block, `eip155:1`, type `BLOCK`,
  full hash recorded in the lifecycle JSON, quality `CORROBORATED`.
- Integrity: no duplicate or mutation flags.
- API: both machines healthy, fresh stats version `0.3.1-studionet`, zero
  state, accounting balanced.
- Frontend: canonical alias serves deployment
  `dpl_3iHiVaxMdhxQwmdgCYJs69PbpQn6`; its bundles contain the current contract
  address and not the former address.

## Evidence boundaries

Direct tests mock nondeterministic validator output and prove contract state
transitions. The live lifecycle proves real fetch and consensus behavior for
its recorded sources, not universal availability of every future source.
Direct tests show 0.3.1 catching an inner failure and persisting the counter,
stage, and timestamp. The first post-cutover real StudioNet assessment did not
advance and a direct read still reported `eval_attempts=0`, demonstrating that
an outer consensus failure bypasses that catch. The production deployment
remains accounting-balanced, but the stalled-consensus threshold is not yet
network-reliable. Former deployments and their immutable test stakes remain
inventoried in `ESCROW_RECOVERY.md`.
