# Crossbench Intelligent Contract - method & state spec

Source: `contracts/crossbench_contract.py`. This is a reference, not a copy
- when in doubt, the contract source is authoritative; re-derive this doc
from it rather than trusting it blindly if the two ever disagree.

Current live deployment is version `0.3.1-studionet` at
`0x2352A0cBF175F1e69eBc8364A35301570378FF22`. It records consensus failures
without reverting their counters. Runner:
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

## Constants

| Name | Value | Meaning |
|---|---|---|
| `MIN_STAKE` / `MAX_STAKE` | `0.001` / `10` GEN (`10**15` / `10*10**18` wei) | Allowed stake range on `create_dispute` |
| `MAX_ITEMS` | 3 | Max evidence items per side in the original bundle |
| `MAX_CHALLENGE_ITEMS` | 2 | Max additive challenge-evidence items per side |
| `MAX_DISPUTES_PAGE` | 24 | Max page size for `list_disputes` |
| `MAX_CLAIM` | 1800 chars (min 40) | Claim text length bounds |
| `MAX_POLICY_REF` | 800 chars (min 8) | Policy/agreement reference length bounds |
| `MAX_URL` | 800 chars | Evidence item location length bound |
| `MAX_DESC` | 600 chars (min 8) | Evidence item description length bounds |
| `MAX_REASON` | 400 chars | Validator reason-code length bound |
| `MAX_POLICY_ISSUER` | 160 chars | Declared authoritative policy/agreement issuer |
| `MAX_CHAIN_ID` | 64 chars | Structured on-chain namespace/chain identifier |
| `MAX_REFERENCE_VALUE` | 200 chars | Transaction hash, block height/hash, contract, or account identifier |
| `RESPONSE_WINDOW` | 86400s (24h) | Time for a respondent to counter-stake and accept |
| `EVIDENCE_WINDOW` | 259200s (72h) | Time for both sides to submit evidence after acceptance |
| `CHALLENGE_WINDOW` | 172800s (48h) | Time to submit additive challenge evidence after a preliminary verdict |
| `ASSESSMENT_TIMEOUT` | 1800s (30m) | Reserved nondeterministic assessment timeout constant |
| `STALL_GRACE_PERIOD` | 259200s (72h) | Extra time past the evidence/challenge deadline before a dispute stuck on repeated consensus failures can be force-resolved |
| `STALL_ATTEMPT_THRESHOLD` | 3 | Minimum recorded consensus failures before `resolve_stalled_dispute` is callable |

`CLAIM_CATEGORIES`: `MODERATION_POLICY_VIOLATION`, `MODERATION_WRONGFUL_ACTION`,
`CONTENT_LISTING_MISMATCH`, `FACTUAL_ACCOUNT_DISPUTE`. Each category maps to a
distinct rubric in `CATEGORY_GUIDANCE` that is injected into the consensus
prompt, so the category actively changes how validators weigh evidence
rather than being a label the assessment ignores.

`BLOCKED_EVIDENCE_HOSTS`: a fixed set of link-shortener and anonymous-paste
hosts (`bit.ly`, `tinyurl.com`, `pastebin.com`, etc., plus their subdomains)
rejected as evidence `location` values on `create_dispute`, `submit_evidence`,
and `submit_challenge_evidence`. These hosts can be silently repointed at
different content after submission without changing the URL on record, which
would defeat the point of pinning evidence - a direct link to the actual
source is required instead.

`SUPPORTS` (per-item validator vote): `CLAIMANT`, `RESPONDENT`, `NEITHER`.

`RELEVANCE`: `LOW`, `MEDIUM`, `HIGH`.

`SOURCE_QUALITY`: `UNVERIFIED`, `CORROBORATED`, `PRIMARY`. Unverified
evidence is retained in the audit record but contributes no verdict weight.

`VERDICTS` (aggregate verdict code): `CLAIMANT`, `RESPONDENT`,
`PARTIAL_CLAIMANT`, `PARTIAL_RESPONDENT`, `INCONCLUSIVE`.

## Dispute status lifecycle

```
CREATED
  --accept_dispute(exact counter-stake)--> EVIDENCE_SUBMISSION
  --cancel_dispute() [claimant only]-----> CANCELLED
  --claim_response_timeout() [after RESPONSE_WINDOW]--> DEFAULTED_NO_RESPONSE

EVIDENCE_SUBMISSION
  --submit_evidence() [respondent] + trigger_evaluation()--> PRELIMINARY_VERDICT
  (trigger_evaluation is callable once the respondent has submitted OR the
   evidence window has closed - by anyone, not just a party)

PRELIMINARY_VERDICT
  --submit_challenge_evidence() [either party, additive only, up to
     MAX_CHALLENGE_ITEMS/side]--> (still PRELIMINARY_VERDICT)
  --finalize_dispute() [after CHALLENGE_WINDOW]--> SETTLED
    (if challenge evidence was added, finalize_dispute re-runs the
     consensus assessment over the full item set - original + challenge -
     before settling; otherwise it settles on the preliminary verdict)

EVIDENCE_SUBMISSION or PRELIMINARY_VERDICT (challenge added)
  --resolve_stalled_dispute() [anyone, after STALL_ATTEMPT_THRESHOLD
     recorded consensus failures AND STALL_GRACE_PERIOD past the relevant
     deadline]--> NO_CONSENSUS_REFUNDED
  (escape hatch for a dispute whose validator consensus keeps failing -
   refunds both stakes rather than leaving them in escrow indefinitely)

SETTLED / CANCELLED / DEFAULTED_NO_RESPONSE / NO_CONSENSUS_REFUNDED  (terminal)
  --withdraw_credit(recipient) [pull-based, recipient must be the transaction sender]
```

## Write methods

All raise `gl.vm.UserError("[EXPECTED] ...")` on invalid input/state - the
`[EXPECTED]` prefix signals a normal validation rejection, not a bug.

### `create_dispute(claim_text, claim_category, intended_respondent, policy_reference, policy_issuer, bundle_json) -> str` (payable)
Claimant opens a dispute and pins their evidence bundle at creation - it
can never be replaced, only added to later via challenge evidence. Stake
is `gl.message.value`, must be in `[MIN_STAKE, MAX_STAKE]`. Returns the new
dispute ID (`"ec-<n>"`, sequential). The wallet-signed transaction binds the
claimant identity, while `intended_respondent` must be a different, nonzero
address and is the only wallet allowed to accept. `policy_issuer` names the
organization that officially published the policy/agreement. `bundle_json` is a JSON array of up to
`MAX_ITEMS` `{kind, location, description}` objects (`kind` is `WEB_PAGE`
or `ONCHAIN_REF`). An `ONCHAIN_REF` additionally requires structured
`chain_id`, `reference_type` (`BLOCK`, `TRANSACTION`, `CONTRACT`, or `ACCOUNT`),
and `reference_value`. The policy reference and every `location`, including an
on-chain explorer/API reference, must be independently retrievable public
HTTPS URLs. Canonically identical evidence URLs (ignoring host case, default
HTTPS port, trailing slash, and fragments) are rejected within and across all
parties' original and challenge bundles. Two explorer URLs identifying the
same structured on-chain object are also rejected as duplicates.

### `accept_dispute(dispute_id)` (payable)
The named intended respondent counter-stakes. The caller's wallet identity
must exactly match `intended_respondent`, and `gl.message.value` must
**exactly** equal the claimant's stake. Only valid while
`status == CREATED` and before `response_deadline`.

### `cancel_dispute(dispute_id)`
Claimant-only, only while `status == CREATED` (before anyone accepts).
Refunds the claimant's stake as a pull-based credit and moves the dispute
to `CANCELLED`.

### `claim_response_timeout(dispute_id)`
Anyone-callable once `response_deadline` has passed with no respondent.
Refunds the claimant and sets `winner = claimant`, status
`DEFAULTED_NO_RESPONSE`.

### `submit_evidence(dispute_id, bundle_json)`
Respondent-only (the claimant's bundle is already pinned from creation).
One-shot - rejects if `bundle_respondent_submitted` is already true. Same
`bundle_json` shape and `MAX_ITEMS` cap as `create_dispute`.

### `trigger_evaluation(dispute_id)`
Anyone-callable once ready (respondent has submitted, or the evidence
window has closed). Runs the nondeterministic multi-validator consensus
assessment (`_run_assessment_consensus`) over every pinned item, computes
the aggregate verdict, and opens the challenge window. This is
deliberately a separate call from `submit_evidence` rather than an
auto-triggered follow-up, so the payable evidence-submission write stays
cheap and predictable and the potentially-slow consensus round is its own
transaction. Records the per-item content fingerprints into
`evidence_fingerprints`, the policy provenance result into
`policy_assessment`, and content aliases into
`source_integrity.duplicate_ids` (see Source integrity, below). If the underlying
consensus call raises (validators disagreed, an LLM formatting fault), version
0.3.1 increments `eval_attempts`, records the stage/time, saves, and returns
successfully. The status remains untouched and the same call can be retried.
Returning is essential: raising after saving would roll the write back on
StudioNet. After `STALL_ATTEMPT_THRESHOLD` recorded failures and
`STALL_GRACE_PERIOD` past the evidence deadline, `resolve_stalled_dispute`
becomes callable.

### `submit_challenge_evidence(dispute_id, bundle_json)`
Either party, only during `PRELIMINARY_VERDICT` and before
`challenge_deadline`. **Additive only** - one shot per party, up to
`MAX_CHALLENGE_ITEMS`. Cannot modify or replace the original bundle.

### `finalize_dispute(dispute_id)`
Anyone-callable once `challenge_deadline` has passed. If challenge
evidence was added, re-runs consensus over the full item set (original +
challenge, both sides) before settling on that final verdict; otherwise
settles directly on the preliminary verdict. Settlement (`_settle`,
internal) is a **pure deterministic function** - separated from the
nondeterministic assessment step by design (per `ARCHITECTURE.md`'s trust
boundary): given a verdict code and the two stakes, it always redistributes
the same way, and it is unreachable except through the two nondeterministic
paths that produce a verdict.

Settlement by verdict code: `CLAIMANT`/`RESPONDENT` credits the full pool
to the winner; `PARTIAL_CLAIMANT`/`PARTIAL_RESPONDENT` splits the pool by
`payout_bps` (basis points, 0-10000); `INCONCLUSIVE` refunds both sides
their own stake.

When challenge evidence was added, the re-run also compares each
originally-judged item's freshly-refetched content fingerprint against the
one recorded at the preliminary verdict (`evidence_fingerprints`) and
records any that changed into `source_integrity.mutated_ids` on the
dispute - visible, auditable evidence that a source was edited after the
preliminary verdict formed, even though settlement still proceeds on the
freshly re-run result. Consensus failures here follow the same pattern as
`trigger_evaluation`: caught, counted into `finalize_attempts`, recorded with
the failure stage and timestamp, and returned without raising so StudioNet
commits the counter. The action remains retryable and eventually becomes
eligible for `resolve_stalled_dispute`.

### `resolve_stalled_dispute(dispute_id)`
Anyone-callable escape hatch for a dispute whose validator consensus keeps
failing. Requires the dispute to be in `EVIDENCE_SUBMISSION` (checking
`eval_attempts` against `evidence_deadline`) or in `PRELIMINARY_VERDICT`
with challenge evidence added (checking `finalize_attempts` against
`challenge_deadline`); requires at least `STALL_ATTEMPT_THRESHOLD` recorded
failures at that stage; requires `STALL_GRACE_PERIOD` to have elapsed past
the relevant deadline. Refunds both parties' own stake as withdrawable
credit (same accounting as `INCONCLUSIVE`) and moves the dispute to the
terminal `NO_CONSENSUS_REFUNDED` status. This exists so that a dispute
cannot hold both stakes in escrow forever if validators are simply unable
to agree (flaky sources, a persistently malformed LLM response, etc.).

### `withdraw_credit(recipient)`
Pull-based withdrawal of the caller's settled/refunded/cancelled credit balance. The recipient must match the transaction sender.
The transaction sender must exactly match `recipient`; nobody can initiate
another account's withdrawal.

## View methods

### `get_dispute(dispute_id) -> dict`
Full dispute record plus computed `can_accept` / `can_claim_timeout` /
`can_submit_evidence` / `can_trigger_evaluation` / `can_challenge` /
`can_finalize` / `can_resolve_stalled` booleans, evaluated against the
current block timestamp - these drive which action buttons the frontend
shows. Also includes `evidence_fingerprints` (per-item content hash from
the last consensus run), `source_integrity.mutated_ids` (items whose
content changed between the preliminary and final run), and
`eval_attempts` / `finalize_attempts` (recorded consensus-failure counts).

### `list_disputes(offset: u256, count: u256) -> {items, total}`
Paginated summary listing (`count` must be `1..MAX_DISPUTES_PAGE`). Each
item is a subset of fields: `id`, `claim`, `claim_category`, `claimant`,
`respondent`, `status`, `stake_wei`, `winner`, `created_at`.

### `get_credit(recipient) -> str`
Current withdrawable balance (wei, as a string) for an address.

### `get_stats() -> dict`
Protocol-wide fields are `product`, `version`, `network`, `chain_id`,
`total_disputes`, `settled`, `inconclusive`, `defaulted`, `cancelled`,
`no_consensus`, `total_deposited_atto`, `dispute_escrow_atto`, `claimable_atto`,
`withdrawn_atto`, and boolean `accounting_balanced`. Amounts are decimal strings
in atto-GEN. `accounting_balanced` proves the contract-level invariant
`total_deposited == dispute_escrow + total_claimable + total_withdrawn`; it does
not prove that an external index is fresh. Never replace these live values with
hardcoded marketing counters.

## Verdict aggregation (`_aggregate`, internal)

Per-item validator votes are combined into one of the five `VERDICTS`
codes plus a `payout_bps` split and `claimant_weight`/`respondent_weight`.
Important aggregation and consensus rules:

- `payout_bps`, `claimant_weight`, and `respondent_weight` are returned as
  **strings**, not raw ints - `genlayer-js` decodes contract dicts in a way
  where a raw int in this position previously crashed as
  `Do not know how to serialize a BigInt` on the frontend.
- Each independently fetched source receives a provenance grade. `PRIMARY`
  means the authoritative publisher/system of record; `CORROBORATED` means a
  credible independently checkable secondary source; `UNVERIFIED` contributes
  no payout weight. Every claim requires all validators to classify the
  declared issuer's policy/agreement as `PRIMARY` or it resolves
  `INCONCLUSIVE`. `ONCHAIN_REF` items must expose ledger data matching the
  structured chain, reference type, and reference value stored on-chain.
- Content-identical items are deterministically linked with `duplicate_of` and
  only the first contributes weight, preventing mirrored URLs from amplifying a
  party's case.
- `_assessments_agree` uses bounded semantic compatibility rather than exact
  categorical equality: adjacent relevance/provenance grades and
  `NEITHER`-versus-one-side uncertainty are accepted, while opposing party
  support, `PRIMARY`-versus-`UNVERIFIED`, or a different duplicate mapping are
  rejected. Whole-page hashes are deliberately not compared during validator
  acceptance because timestamps, counters, localization, and CDN variants make
  byte equality brittle; hashes remain audit and mutation-detection metadata.
  On-chain references additionally require validators to agree on the
  verified/unverified boundary (unanimous `UNVERIFIED` is recorded and given
  zero weight), while every policy/agreement reference requires every
  validator to classify the declared issuer's source as `PRIMARY`.
  Free-text `reason_code` remains
  informational and excluded from consensus.

## Security notes baked into the contract

- URL parsing rejects credentials, localhost/local domains, and private,
  loopback, link-local, reserved, or unspecified IPv4/IPv6 literal targets.
- URL parsing also rejects `BLOCKED_EVIDENCE_HOSTS` (link shorteners,
  anonymous pastes, and their subdomains) - these can be silently
  repointed at different content after submission, undermining the point
  of pinning evidence at creation/submission time.
- All text fields are length- and NUL-byte-bounded (`_text` helper).
- Every validator independently fetches every evidence source itself; a party's own
  characterization of their evidence is never trusted (see
  `ARCHITECTURE.md`'s trust-boundary section).
- Unreachable sources are deterministically forced to
  `UNVERIFIED`/`NEITHER`/`LOW`, and
  duplicate or incomplete assessment item sets are rejected.
- **Duplicate resistance**: canonical URL duplicates are rejected at every
  submission boundary. Structured on-chain identity also prevents the same
  block/transaction/contract/account being resubmitted through another
  explorer. Different URLs returning identical fetched content are
  recorded in `source_integrity.duplicate_ids`, linked by `duplicate_of`, and
  excluded from aggregate weight after the first occurrence.
- **Independent source verification**: every validator fetches and judges each
  source itself. The leader records a SHA-256 fingerprint (truncated to 16 hex
  chars) for audit and later mutation detection, but validators do not require
  whole-page byte equality because harmless dynamic page elements would make
  that comparison brittle. Material disagreement is handled through support,
  provenance, relevance, availability, and duplicate-mapping checks.
- **Mutable-evidence detection**: when challenge evidence triggers a second
  consensus run at `finalize_dispute`, every originally-judged item's new
  fingerprint is compared against the one recorded at the preliminary
  verdict (`evidence_fingerprints`). Any item whose content changed is
  recorded in `source_integrity.mutated_ids` on the dispute record - a
  visible, permanent audit trail of a source being swapped after the
  preliminary verdict, surfaced on the frontend as a warning.
- **Category-aware adjudication**: `claim_category` selects a distinct
  rubric from `CATEGORY_GUIDANCE` that is injected into the consensus
  prompt, so the category actually changes how evidence gets weighed
  rather than being a label the LLM is free to interpret generically.
- **Stalled-consensus recovery**: `trigger_evaluation` and `finalize_dispute`
  catch a failed consensus run, record its counter/stage/time, and return
  successfully while leaving the action retryable. This lets StudioNet commit
  the recovery state. After
  `STALL_ATTEMPT_THRESHOLD` failures and `STALL_GRACE_PERIOD` past the
  relevant deadline, `resolve_stalled_dispute` refunds both stakes rather
  than leaving a dispute that cannot reach consensus stuck in escrow
  indefinitely.
