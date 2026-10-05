# Crossbench Intelligent Contract - method & state spec

Source: `contracts/crossbench_contract.py`. This is a reference, not a copy
- when in doubt, the contract source is authoritative; re-derive this doc
from it rather than trusting it blindly if the two ever disagree.

Current live deployment (StudioNet): `0x44a98ec678A32aCc7024Db2B6242db62b509E8cA`
(see `README.md` / `CONTRACT_DEPLOYMENT.md`). Runner:
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
| `RESPONSE_WINDOW` | 86400s (24h) | Time for a respondent to counter-stake and accept |
| `EVIDENCE_WINDOW` | 259200s (72h) | Time for both sides to submit evidence after acceptance |
| `CHALLENGE_WINDOW` | 172800s (48h) | Time to submit additive challenge evidence after a preliminary verdict |
| `ASSESSMENT_TIMEOUT` | 1800s (30m) | Reserved nondeterministic assessment timeout constant |

`CLAIM_CATEGORIES`: `MODERATION_POLICY_VIOLATION`, `MODERATION_WRONGFUL_ACTION`,
`CONTENT_LISTING_MISMATCH`, `FACTUAL_ACCOUNT_DISPUTE`.

`SUPPORTS` (per-item validator vote): `CLAIMANT`, `RESPONDENT`, `NEITHER`.

`RELEVANCE`: `LOW`, `MEDIUM`, `HIGH`.

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

SETTLED / CANCELLED / DEFAULTED_NO_RESPONSE  (terminal)
  --withdraw_credit(recipient) [pull-based, recipient must be the transaction sender]
```

## Write methods

All raise `gl.vm.UserError("[EXPECTED] ...")` on invalid input/state - the
`[EXPECTED]` prefix signals a normal validation rejection, not a bug.

### `create_dispute(claim_text, claim_category, policy_reference, bundle_json) -> str` (payable)
Claimant opens a dispute and pins their evidence bundle at creation - it
can never be replaced, only added to later via challenge evidence. Stake
is `gl.message.value`, must be in `[MIN_STAKE, MAX_STAKE]`. Returns the new
dispute ID (`"ec-<n>"`, sequential). `bundle_json` is a JSON array of up to
`MAX_ITEMS` `{kind, location, description}` objects (`kind` is `WEB_PAGE`
or `ONCHAIN_REF`). Every `location`, including an on-chain explorer/API
reference, must be an independently retrievable public HTTPS URL.

### `accept_dispute(dispute_id)` (payable)
Respondent counter-stakes. `gl.message.value` must **exactly** equal the
claimant's stake. Cannot be the claimant's own address. Only valid while
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
transaction.

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

### `withdraw_credit(recipient)`
Pull-based withdrawal of the caller's settled/refunded/cancelled credit balance. The recipient must match the transaction sender.
The transaction sender must exactly match `recipient`; nobody can initiate
another account's withdrawal.

## View methods

### `get_dispute(dispute_id) -> dict`
Full dispute record plus computed `can_accept` / `can_claim_timeout` /
`can_submit_evidence` / `can_trigger_evaluation` / `can_challenge` /
`can_finalize` booleans, evaluated against the current block timestamp -
these drive which action buttons the frontend shows.

### `list_disputes(offset: u256, count: u256) -> {items, total}`
Paginated summary listing (`count` must be `1..MAX_DISPUTES_PAGE`). Each
item is a subset of fields: `id`, `claim`, `claim_category`, `claimant`,
`respondent`, `status`, `stake_wei`, `winner`, `created_at`.

### `get_credit(recipient) -> str`
Current withdrawable balance (wei, as a string) for an address.

### `get_stats() -> dict`
Protocol-wide fields are `product`, `version`, `network`, `chain_id`,
`total_disputes`, `settled`, `inconclusive`, `defaulted`, `cancelled`,
`total_deposited_atto`, `dispute_escrow_atto`, `claimable_atto`,
`withdrawn_atto`, and boolean `accounting_balanced`. Amounts are decimal strings
in atto-GEN. `accounting_balanced` proves the contract-level invariant
`total_deposited == dispute_escrow + total_claimable + total_withdrawn`; it does
not prove that an external index is fresh. Never replace these live values with
hardcoded marketing counters.

## Verdict aggregation (`_aggregate`, internal)

Per-item validator votes are combined into one of the five `VERDICTS`
codes plus a `payout_bps` split and `claimant_weight`/`respondent_weight`.
Two consensus-agreement rules worth knowing (both were real bugs found via
integration testing, see `MEMORY.md`):

- `payout_bps`, `claimant_weight`, and `respondent_weight` are returned as
  **strings**, not raw ints - `genlayer-js` decodes contract dicts in a way
  where a raw int in this position previously crashed as
  `Do not know how to serialize a BigInt` on the frontend.
- Per-item validator agreement (`_assessments_agree`, used by the
  underlying Equivalence Principle consensus) requires an **exact** match
  on both `supports` and payout-critical `relevance`. Free-text
  `reason_code` is informational and excluded from agreement because prose
  phrasing is not decision-critical.

## Security notes baked into the contract

- URL parsing rejects credentials, localhost/local domains, and private,
  loopback, link-local, reserved, or unspecified IPv4/IPv6 literal targets.
- All text fields are length- and NUL-byte-bounded (`_text` helper).
- Every validator independently fetches every evidence source itself; a party's own
  characterization of their evidence is never trusted (see
  `ARCHITECTURE.md`'s trust-boundary section).
- Unreachable sources are deterministically forced to `NEITHER`/`LOW`, and
  duplicate or incomplete assessment item sets are rejected.
