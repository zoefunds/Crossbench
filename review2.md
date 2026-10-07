# Source verification hardening

Last verified: 2026-10-07

Contract version: `0.3.0-studionet`

Production contract: `0x5904faF3215cC2B0664adf5Fa0a8f0C000e5BAF6`

## Request addressed

This document records the changes made in response to the following request:

> Please improve how sources are verified. The contract should confirm that
> submitted sources are authoritative and trustworthy, especially for policy
> and on-chain references. It should also detect duplicate sources and avoid
> relying on brittle exact-match comparisons when validators evaluate evidence.

The work is limited to source submission, independent fetching, provenance,
duplicate handling, validator agreement, source-integrity records, and the
application surfaces that collect or display those fields.

## Result

The contract no longer treats a syntactically valid HTTPS URL as sufficient
evidence of authority. Each validator independently fetches the declared policy
and every submitted source, classifies provenance, validates specialized
on-chain identity, and returns normalized decision fields. The contract gives
no adjudicative weight to unverified evidence or repeated content.

Validator acceptance is based on material evidentiary agreement rather than
complete page-byte or free-text equality. Content fingerprints remain recorded
for duplicate detection, mutation detection, and audit visibility.

## 1. Submission-time source controls

### Public HTTPS requirement

`_url` validates policy and evidence URLs before they enter contract state. A
source must:

- use HTTPS;
- contain no embedded username or password;
- use a non-empty public hostname;
- avoid `localhost`, `.local`, and private, loopback, link-local, reserved, or
  unspecified literal IPv4/IPv6 ranges; and
- avoid known redirect and anonymous-paste hosts.

The blocked-host set includes services such as URL shorteners and paste sites
whose destination or content can be replaced without changing the submitted
location. Subdomains of blocked hosts are rejected as well.

DNS-resolution-time private-address protection remains a responsibility of the
GenLayer validator fetch environment because the contract validates the URL,
not the infrastructure's resolved socket address.

### Bounded immutable metadata

Every evidence item contains:

```json
{
  "kind": "WEB_PAGE",
  "location": "https://public.example/evidence",
  "description": "What this source establishes and why it matters"
}
```

Locations are limited to 800 characters and descriptions to 8–600 characters.
NUL bytes are rejected. Original bundles are immutable once stored. Each side
may later submit one additive challenge bundle of at most two items; challenge
evidence cannot replace the original record.

## 2. Authoritative policy verification

`create_dispute` now requires both `policy_reference` and `policy_issuer`.
`policy_issuer` is stored in the dispute and passed into every preliminary and
final assessment.

Each validator independently fetches the policy URL and determines whether it
is genuinely the declared issuer's own policy or agreement. Policy provenance
is normalized to:

- `PRIMARY`: the issuer's authoritative document;
- `CORROBORATED`: a credible secondary or archived representation; or
- `UNVERIFIED`: unavailable, unverifiable, or not attributable to the issuer.

The policy boundary is strict. Validator consensus must agree that the policy
is `PRIMARY` before any evidence can contribute adjudicative weight. If the
consensus records a non-primary policy, `_aggregate` returns an
`INCONCLUSIVE` result with zero evidence weight. A submitter cannot
turn a secondary summary into an authoritative policy merely by naming an
issuer in the transaction.

Unavailable policy fetches are normalized to `UNVERIFIED` with
`SOURCE_UNAVAILABLE`; submitter-authored descriptions never substitute for fetched
policy content.

## 3. Specialized on-chain verification

An `ONCHAIN_REF` is no longer just an explorer URL. It must contain a structured
ledger identity:

```json
{
  "kind": "ONCHAIN_REF",
  "location": "https://eth.blockscout.com/api/v2/blocks/0",
  "description": "Ethereum mainnet genesis block returned by a public API",
  "chain_id": "eip155:1",
  "reference_type": "BLOCK",
  "reference_value": "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3"
}
```

Allowed reference types are `BLOCK`, `TRANSACTION`, `CONTRACT`, and `ACCOUNT`.
The chain identifier is limited to 64 characters and the object value to
2–200 characters, using a restricted identifier character set.

Validators must confirm that the independently fetched ledger data matches the
submitted chain, object type, and object value. For these items, validator
agreement uses a strict verified/unverified boundary: a validator cannot accept
another validator's assessment when one considers the ledger object verified
and the other considers it unverified. Unanimous `UNVERIFIED` remains a valid
auditable outcome, but contributes zero weight.

## 4. Duplicate-source protection

Duplicate handling occurs before storage and again after independent fetching.

### Canonical URL duplicates

`_source_identity` and `_reject_duplicate_locations` canonicalize web source
locations by:

- lowercasing the hostname;
- removing the default HTTPS port;
- removing fragments; and
- normalizing trailing slashes.

The check applies within a submitted bundle and against all evidence already
stored in the dispute. A cosmetic URL variation therefore cannot be used to
resubmit the same location during later evidence submission.

### Cross-explorer on-chain duplicates

For on-chain evidence, identity is derived from:

```text
chain_id : reference_type : reference_value
```

The same block, transaction, contract, or account is rejected even when a
submitter changes the explorer domain or API route.

### Same-content duplicates

Every validator computes a SHA-256 fingerprint from the content it fetched.
Within an assessment, later items with an already-seen fingerprint receive a
deterministic `duplicate_of` link to the first item. The duplicate relationship
is part of material validator agreement, stored in
`source_integrity.duplicate_ids`, and excluded from `_aggregate` weight.

This prevents mirrored pages or copied documents on distinct URLs from
amplifying the same evidence.

## 5. Validator agreement without fragile page equality

Every validator performs its own fetch. Dynamic pages can legitimately differ
in timestamps, counters, localization, CDN markup, or unrelated navigation.
Requiring complete fetched-page hashes to match would reject otherwise
consistent judgments.

`_assessments_agree` therefore compares normalized decision-critical fields:

- the complete expected item-ID set;
- `supports` (`CLAIMANT`, `RESPONDENT`, or `NEITHER`);
- `relevance` (`LOW`, `MEDIUM`, or `HIGH`);
- `source_quality` (`UNVERIFIED`, `CORROBORATED`, or `PRIMARY`);
- the deterministic `duplicate_of` relationship; and
- the policy provenance result.

The comparison permits bounded judgment variance where it cannot reverse the
meaning of the evidence. Adjacent relevance or provenance grades may agree,
and one-sided support may agree with uncertainty. The following remain hard
conflicts:

- direct claimant-versus-respondent support;
- a material provenance disagreement;
- verified-versus-unverified disagreement for structured on-chain evidence;
- primary-versus-non-primary policy disagreement; and
- different duplicate mappings.

`content_hash` and free-text `reason_code` are intentionally excluded from the
agreement predicate. They remain recorded metadata and cannot directly change
the result.

## 6. Weighting and deterministic outcomes

`_aggregate` applies source verification before calculating a verdict:

- a non-primary policy forces `INCONCLUSIVE` with zero evidence weights;
- an `UNVERIFIED` evidence item contributes no weight;
- an item carrying `duplicate_of` contributes no weight; and
- only independently verified, non-duplicate evidence contributes according
  to its support and relevance.

This means provenance and duplicate controls affect the recorded verdict
through deterministic contract rules rather than frontend filtering or
advisory text.

## 7. Fingerprints and mutation visibility

At the preliminary verdict, the contract stores each independently fetched
item's `content_hash` in `evidence_fingerprints`.

If challenge evidence causes `finalize_dispute` to run a second assessment,
the contract compares the fresh fingerprints of original items with their
preliminary values. Changed items are recorded in
`source_integrity.mutated_ids`. Settlement uses the freshly assessed evidence,
while the mutation remains permanently visible in the dispute audit record and
is surfaced by the frontend.

## 8. Frontend and autofill alignment

The evidence editor mirrors the contract's source rules:

- public HTTPS validation and blocked-host rejection;
- 8–600 character descriptions;
- structured fields for every on-chain reference;
- canonical URL duplicate detection; and
- structured ledger-object duplicate detection across explorer URLs.

Creation collects the policy issuer alongside the policy reference. Dispute
detail pages display policy provenance, evidence provenance, structured
on-chain identity, duplicate links, fingerprints, and mutation warnings.

Autofill now covers all four claim categories with first-party policy URLs that
match their declared issuer. Every original and additional-evidence form uses
distinct sources, satisfying the contract's cross-bundle duplicate rules. The
Ethereum example includes the full canonical genesis-block identity. All 20
autofill URLs returned HTTP 200 during the 2026-10-07 check.

## 9. Automated verification

The following contract tests directly cover this work:

- `test_policy_reference_must_be_public_https`
- `test_onchain_reference_must_be_independently_fetchable_https`
- `test_shortener_and_paste_hosts_rejected_as_evidence`
- `test_paste_subdomain_also_rejected`
- `test_duplicate_canonical_urls_rejected_within_and_across_bundles`
- `test_content_duplicates_are_recorded_and_do_not_double_count`
- `test_onchain_references_require_structured_identity_and_dedupe_across_explorers`
- `test_unverified_policy_and_evidence_cannot_drive_payout`
- `test_validator_comparison_allows_bounded_judgment_variance_but_rejects_conflicts`
- `test_preliminary_assessment_carries_content_fingerprints`
- `test_source_integrity_flags_evidence_mutated_after_preliminary_verdict`
- `test_evidence_bundles_are_pinned_and_immutable`

Frontend tests verify that autofill satisfies contract bounds, on-chain fields
are mandatory, explorer aliases are treated as duplicates, and prohibited
source locations are rejected.

Verification baseline on 2026-10-07:

```text
contract direct suite       33 passed
GenVM lint/validation       3/3 passed; 14 methods recognized
frontend suite              9 passed
frontend typecheck          passed
frontend ESLint             passed
frontend production build   passed
```

## 10. Live verification

Production dispute `ec-1` exercised the deployed path using real public
sources and GenLayer validator consensus:

- declared issuer: Ethereum Foundation;
- policy reference: official `ethereum.org` blocks documentation;
- policy provenance: `PRIMARY`;
- on-chain source: Blockscout Ethereum mainnet block-0 API;
- structured identity: `eip155:1`, `BLOCK`, full genesis hash;
- on-chain source provenance: `CORROBORATED`;
- duplicate IDs: none; and
- mutated IDs: none.

The live result reached `PRELIMINARY_VERDICT`. The evidence itself was assessed
as low relevance to the precise claim and therefore produced an
`INCONCLUSIVE` preliminary outcome. That is the intended behavior: a source may
be authentic and independently verifiable without being sufficiently relevant
to decide the submitted allegation.

Durable live source-assessment details are stored in
`docs/PRODUCTION_LIVE_LIFECYCLE_STATE.json`.

## Files changed for this request

- `contracts/crossbench_contract.py`
- `contracts/tests/direct/conftest.py`
- `contracts/tests/direct/test_crossbench.py`
- `contracts/tests/direct/test_crossbench_hardening.py`
- `frontend/components/EvidenceBundleEditor.tsx`
- `frontend/app/disputes/new/page.tsx`
- `frontend/app/disputes/[id]/page.tsx`
- `frontend/app/disputes/[id]/DisputeActions.tsx`
- `frontend/lib/exampleData.ts`
- `frontend/tests/example-data.test.ts`
- contract, architecture, deployment, operations, and verification docs
