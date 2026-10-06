# Review response - Crossbench hardening (2026-10-06)

This records what was changed in response to team review feedback, and the
evidence that each change actually works - both in local test suites and
live on GenLayer StudioNet against the production contract. It does not
catalog every change made this session, only the ones that answer that
feedback.

## 1. Category-aware adjudication and source authenticity

### Generic category rules

**Before**: `claim_category` was validated against a fixed set of 4 strings
(`MODERATION_POLICY_VIOLATION`, `MODERATION_WRONGFUL_ACTION`,
`CONTENT_LISTING_MISMATCH`, `FACTUAL_ACCOUNT_DISPUTE`) and then stored as a
label on the dispute. It had no effect on how the consensus assessment prompt
actually judged evidence - every category went through the same generic
instructions.

**Fix**: `contracts/crossbench_contract.py` adds `CATEGORY_GUIDANCE`, a dict
mapping each of the 4 categories to its own adjudication rubric:

```python
CATEGORY_GUIDANCE = {
    "MODERATION_POLICY_VIOLATION": (
        "This is a platform-policy-violation claim. Weigh most heavily any evidence that quotes or links the "
        "specific policy clause and compares it against the actual content/action taken. ..."
    ),
    "MODERATION_WRONGFUL_ACTION": ( ... ),
    "CONTENT_LISTING_MISMATCH": ( ... ),
    "FACTUAL_ACCOUNT_DISPUTE": ( ... ),
}
```

`_run_assessment_consensus` injects the dispute's specific rubric into the
leader/validator prompt via `CATEGORY_GUIDANCE=` in the prompt string, so the
category now actively steers what each validator treats as relevant evidence,
rather than being a cosmetic field.

**Verified by**: `test_category_guidance_is_distinct_per_category_and_reaches_trigger_evaluation`
(`contracts/tests/direct/test_crossbench_hardening.py`) asserts every category
has its own non-empty, mutually distinct rubric, and exercises a
`FACTUAL_ACCOUNT_DISPUTE` dispute through a full `trigger_evaluation` call to
confirm the category-guided prompt path executes end to end.

### Weak source-authenticity controls

**Before**: evidence `location` URLs were only checked for HTTPS and for
pointing at a public (non-private/non-loopback) host. Nothing stopped a party
from submitting a link-shortener or anonymous-paste URL, which can be silently
repointed at different content after submission without changing the URL on
record. Nothing required validators to agree on *what content* they actually
fetched - only on their final verdict fields.

**Fix**, two parts:

1. `BLOCKED_EVIDENCE_HOSTS` - a fixed set of link-shortener and
   anonymous-paste hosts (`bit.ly`, `tinyurl.com`, `t.co`, `pastebin.com`,
   etc., plus their subdomains) is now rejected by `_url()` at submission
   time, for every evidence-bearing write (`create_dispute`,
   `submit_evidence`, `submit_challenge_evidence`).
2. Content-hash validator agreement - each validator's independent fetch of
   an evidence source is fingerprinted (`_fingerprint`, SHA-256 truncated to
   16 hex characters). That fingerprint is now part of what
   `_assessments_agree` requires to match between the leader and each
   validator, alongside `supports` and `relevance`. A source that renders
   differently between two independent fetches (edited mid-flight,
   inconsistent CDN/geo content, a since-repointed redirect) now fails
   consensus outright instead of being silently trusted.

**Verified by**:
- `test_shortener_and_paste_hosts_rejected_as_evidence` and
  `test_paste_subdomain_also_rejected` confirm the host blocklist rejects
  both a direct shortener URL and a paste-site subdomain, for both evidence
  kinds.
- `test_preliminary_assessment_carries_content_fingerprints` confirms every
  assessed item carries a real, content-derived `content_hash` recorded in
  `evidence_fingerprints`.
- Live on StudioNet: the real-consensus integration test and the manual
  production e2e run both produced matching `content_hash` values for
  independently-fetched evidence (see `MEMORY.md`), proving the mechanism
  works against the actual GenVM multi-validator pipeline, not just mocks.

## 2. Evidence integrity and consensus recovery

### Mutable URL evidence

**Before**: nothing detected whether an evidence source's content changed
between the preliminary verdict (formed at `trigger_evaluation`) and the
final verdict (re-run at `finalize_dispute` if challenge evidence was added).
A party could, in principle, edit a source after the preliminary verdict and
have the final re-assessment silently judge different content with no record
of the discrepancy.

**Fix**: `finalize_dispute` now compares, for every item that was already
judged at the preliminary stage, its freshly re-fetched `content_hash`
against the one recorded in `evidence_fingerprints` at the preliminary
verdict. Any item whose fingerprint changed is recorded in
`dispute["source_integrity"]["mutated_ids"]` - a permanent, queryable,
frontend-visible audit trail. The final verdict still settles on the
freshly re-run result (code and category guidance already treat prompt
content as untrusted data), but the fact that a source changed is no longer
invisible.

The frontend surfaces this: `frontend/app/disputes/[id]/page.tsx` renders an
explicit warning banner when `source_integrity.mutated_ids` is non-empty.

**Verified by**: `test_source_integrity_flags_evidence_mutated_after_preliminary_verdict`
drives a full create -> accept -> evidence -> `trigger_evaluation` ->
challenge -> `finalize_dispute` cycle where one claimant evidence URL's
mocked content is swapped between the two consensus rounds, and asserts
`source_integrity.mutated_ids == ["A1"]` while confirming settlement still
completes.

### No clear failed-consensus recovery

**Before**: if the nondeterministic consensus call inside `trigger_evaluation`
or `finalize_dispute` failed (validators disagree, a malformed LLM response),
the write simply reverted with no state recorded about the failure, and there
was no path forward other than "try calling it again, indefinitely, forever,
with no visibility into whether that's expected to eventually work."

**Fix**: both `trigger_evaluation` and `finalize_dispute` now wrap the
consensus call in a `try`/`except`. On failure, they increment a persisted
counter (`eval_attempts` / `finalize_attempts`), save it, and raise a
`[CONSENSUS_FAILED]` `UserError` that names the attempt count and explains
both that a retry is safe and what the escape hatch is. After
`STALL_ATTEMPT_THRESHOLD` (3) recorded failures and `STALL_GRACE_PERIOD` (72h)
past the relevant deadline, the new `resolve_stalled_dispute(dispute_id)`
write becomes callable by anyone: it refunds both parties' own stake as
withdrawable credit (the same accounting path as an `INCONCLUSIVE`
settlement) and moves the dispute to a new terminal status,
`NO_CONSENSUS_REFUNDED`. `get_dispute` exposes a computed `can_resolve_stalled`
flag so the frontend can surface this without re-deriving the threshold/grace
logic, and `DisputeActions.tsx` renders a "Refund both stakes" action when
it's true.

**Verified by**: `test_resolve_stalled_dispute_rejected_before_attempts_or_grace_period`
and `test_resolve_stalled_dispute_refunds_both_parties_after_repeated_failures`
drive three consecutive real failed `trigger_evaluation` calls (no consensus
mock installed), confirm each is caught, counted, and surfaced as
`[CONSENSUS_FAILED]` without corrupting dispute state, confirm
`resolve_stalled_dispute` is rejected before the threshold/grace period and
accepted after, and confirm both parties' stakes are refunded with
`accounting_balanced` staying true throughout.

## 3. Refund workflow completeness and runtime verification

### Incomplete refund workflow

**Before**: `cancel_dispute` and `claim_response_timeout` both call `_credit`
to create withdrawable claimant credit, but the only `withdraw_credit` action
in the frontend was gated to `dispute.status === "SETTLED"`
(`frontend/app/disputes/[id]/DisputeActions.tsx`), and the profile page
(`frontend/app/profile/page.tsx`) only ever displayed the credit balance with
no way to withdraw it.

**Fix**:
- `DisputeActions.tsx`: the withdraw action now renders for
  `["SETTLED", "CANCELLED", "DEFAULTED_NO_RESPONSE", "NO_CONSENSUS_REFUNDED"]`
  (the last status added by the consensus-recovery fix above), covering every
  status that can actually carry claimant credit.
- `profile/page.tsx`: added a standing "Withdraw" button wired to the same
  `withdraw_credit` write, so a party doesn't need to navigate back to a
  specific dispute page to claim a refund - this matters because credit is a
  per-wallet balance, not a per-dispute one.

**Verified by**: not just a code review, but a live transaction. A real
dispute (`ec-2`) was created, cancelled, and its credit withdrawn directly
against the live production contract: credit went `0.05 GEN -> 0`, status
reached `CANCELLED`, and `get_stats().withdrawn_atto` reflects it - exercised
end to end on-chain, not only in code.

### Unexecuted runtime suites

**Before**: `contracts/tests/integration/test_lifecycle.py` existed in the
repository but had never been run - its two deterministic test accounts held
a zero GEN balance on StudioNet, so every write in the suite would have
failed before reaching any assertion.

**Fix**: the two accounts
(`0xF526ADbdEB5169e7CeA32c06EF69d7ce4a2D6276` /
`0x94D2637d397f7277b4d9d21796bbAFe08F9De416`) were funded, and the suite was
actually run:

```bash
pytest contracts/tests/integration/test_lifecycle.py -m slow -k "not production_visible" --network studionet
```

3 passed in 201 seconds, each deploying its own disposable contract and
running real (not mocked) multi-validator GenVM consensus:
`test_full_moderation_appeal_lifecycle_real_consensus`,
`test_adversarial_evidence_content_is_not_authoritative`,
`test_symmetric_treatment_of_both_bundles`.

The direct-mode suite (`contracts/tests/direct/`) also grew from 18 to 25
tests, adding coverage for every mechanism in this document; all 25 pass.

Two tests remain unrun and are tracked, not silently skipped:
`test_production_visible_lifecycle_real_consensus` (writes a labelled dispute
directly to the live production contract) and
`test_resume_recorded_live_lifecycle_after_challenge_expiry` (needs a real
48-hour wait past a recorded challenge deadline, by design - the contract's
windows are not shortened for testing). Current status of both: `MEMORY.md`.

## Deployment and cutover

All of the above required a new contract deployment, since GenLayer contracts
are immutable. The hardened contract was deployed to StudioNet, verified
fresh (`accounting_balanced: true`, zero disputes), and production was cut
over: Fly `CONTRACT_ADDRESS`, Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS`, and the
canonical `crossbench-app.vercel.app` alias all point at it. Full record,
including the exact commands run and what was verified at each step:
`CONTRACT_DEPLOYMENT.md`.

## Summary of files changed for this review response

- `contracts/crossbench_contract.py` - all five contract-level fixes above.
- `contracts/tests/direct/test_crossbench_hardening.py` - 7 new tests.
- `contracts/tests/integration/test_lifecycle.py` - `PRODUCTION_CONTRACT`
  repointed to the new address.
- `frontend/app/disputes/[id]/DisputeActions.tsx` - withdraw gating fix,
  `resolve_stalled_dispute` action.
- `frontend/app/disputes/[id]/page.tsx` - `source_integrity` warning,
  `can_resolve_stalled` wiring.
- `frontend/app/profile/page.tsx` - standing withdraw button.
- `frontend/components/StatusBadge.tsx` - `NO_CONSENSUS_REFUNDED` styling.
- `backend/src/indexer/poll.ts` - `NO_CONSENSUS_REFUNDED` added to the
  terminal-status set so resolved-stalled disputes stop being re-polled.
