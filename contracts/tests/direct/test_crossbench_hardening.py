import sys
import json
from datetime import datetime, timedelta, timezone
from conftest import CONTRACT, STAKE, bundle, onchain_bundle, mock_assessment, mock_pages_ok, addr_hex


def _create(direct_vm, contract, claimant, respondent, category="MODERATION_POLICY_VIOLATION"):
    direct_vm.sender = claimant
    direct_vm.value = STAKE
    return contract.create_dispute(
        "The platform removed my post citing rule 4.2 but the post never mentioned the restricted topic.",
        category, addr_hex(respondent), "https://platform.example.com/policy#rule-4.2", "Example Platform", bundle(1, 2),
    )


def _warp(days: int) -> None:
    gl_mod = sys.modules.get("genlayer.gl")
    assert gl_mod is not None, "contract module must already be loaded"
    future = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")
    gl_mod.message_raw["datetime"] = future


def test_shortener_and_paste_hosts_rejected_as_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    bad_bundle = json.dumps([{"kind": "WEB_PAGE", "location": "https://bit.ly/abc123", "description": "shortened link to the policy page"}])
    with direct_vm.expect_revert("link shortener"):
        contract.create_dispute("x" * 40, "MODERATION_POLICY_VIOLATION", addr_hex(direct_bob), "https://platform.example.com/policy", "Example Platform", bad_bundle)


def test_paste_subdomain_also_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    bad_bundle = onchain_bundle("https://mirror.pastebin.com/raw/abc", "eip155:1", "TRANSACTION", "0xabc", "mirrored explorer dump")
    with direct_vm.expect_revert("link shortener"):
        contract.create_dispute("x" * 40, "MODERATION_POLICY_VIOLATION", addr_hex(direct_bob), "https://platform.example.com/policy", "Example Platform", bad_bundle)


def test_duplicate_canonical_urls_rejected_within_and_across_bundles(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    duplicate_bundle = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://Example.com/report/#first", "description": "first copy of the report"},
        {"kind": "WEB_PAGE", "location": "https://example.com/report", "description": "same report under a fragment"},
    ])
    with direct_vm.expect_revert("duplicate evidence source"):
        contract.create_dispute("x" * 40, "FACTUAL_ACCOUNT_DISPUTE", addr_hex(direct_bob), "https://platform.example.com/policy", "Example Platform", duplicate_bundle)

    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)
    cross_party_duplicate = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://EXAMPLE.com:443/1/#copy", "description": "claimant source resubmitted by respondent"},
    ])
    with direct_vm.expect_revert("duplicate evidence source"):
        contract.submit_evidence(dispute_id, cross_party_duplicate)


def test_content_duplicates_are_recorded_and_do_not_double_count(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    direct_vm.mock_web(r"https://example\.com/[12]$", {"status": 200, "body": "same underlying report"})
    direct_vm.mock_web(r"https://example\.com/9$", {"status": 200, "body": "independent response"})
    direct_vm.mock_web(r"https://platform\.example\.com/policy.*", {"status": 200, "body": "official policy"})
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("RESPONDENT", "HIGH")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    contract.trigger_evaluation(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert dispute["source_integrity"]["duplicate_ids"] == ["A2"]
    assert dispute["preliminary_assessment"][1]["duplicate_of"] == "A1"
    assert dispute["preliminary_verdict"]["claimant_weight"] == "3"
    assert dispute["preliminary_verdict"]["respondent_weight"] == "3"
    assert dispute["preliminary_verdict"]["verdict_code"] == "INCONCLUSIVE"


def test_onchain_references_require_structured_identity_and_dedupe_across_explorers(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    incomplete = json.dumps([{
        "kind": "ONCHAIN_REF", "location": "https://explorer.example/block/42",
        "description": "block reference without a structured ledger identity",
    }])
    with direct_vm.expect_revert("chain_id"):
        contract.create_dispute(
            "x" * 40, "FACTUAL_ACCOUNT_DISPUTE", addr_hex(direct_bob),
            "https://platform.example.com/policy", "Example Platform", incomplete,
        )

    claimant_bundle = onchain_bundle("https://explorer-one.example/block/42", "eip155:1", "BLOCK", "42")
    dispute_id = contract.create_dispute(
        "x" * 40, "FACTUAL_ACCOUNT_DISPUTE", addr_hex(direct_bob),
        "https://platform.example.com/policy", "Example Platform", claimant_bundle,
    )
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)
    same_ledger_object = onchain_bundle("https://explorer-two.example/blocks/42", "EIP155:1", "BLOCK", "42")
    with direct_vm.expect_revert("duplicate evidence source"):
        contract.submit_evidence(dispute_id, same_ledger_object)


def test_unverified_policy_and_evidence_cannot_drive_payout(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)
    mock_pages_ok(direct_vm)
    response = {"policy": {"source_quality": "UNVERIFIED", "reason_code": "NOT_OFFICIAL"}, "items": [
        {"id": "A1", "supports": "CLAIMANT", "relevance": "HIGH", "source_quality": "UNVERIFIED", "reason_code": "PARTY_AUTHORED"},
        {"id": "A2", "supports": "CLAIMANT", "relevance": "HIGH", "source_quality": "PRIMARY", "reason_code": "PRIMARY"},
        {"id": "B1", "supports": "NEITHER", "relevance": "LOW", "source_quality": "PRIMARY", "reason_code": "PRIMARY"},
    ]}
    direct_vm.mock_llm(r".*EVIDENCE_COURT_ASSESSMENT_V1.*", json.dumps(response))
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    contract.trigger_evaluation(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert dispute["policy_assessment"]["source_quality"] == "UNVERIFIED"
    assert dispute["preliminary_verdict"]["verdict_code"] == "INCONCLUSIVE"
    assert dispute["preliminary_verdict"]["claimant_weight"] == "0"


def test_validator_comparison_allows_bounded_judgment_variance_but_rejects_conflicts(direct_vm, direct_deploy):
    direct_deploy(CONTRACT)
    module = sys.modules["_contract_crossbench_contract"]
    base = {"policy": {"source_quality": "PRIMARY", "content_hash": "policy"}, "items": [
        {"id": "A1", "supports": "CLAIMANT", "relevance": "MEDIUM", "source_quality": "CORROBORATED", "content_hash": "content"},
    ]}
    adjacent = {"policy": {"source_quality": "CORROBORATED", "content_hash": "policy"}, "items": [
        {"id": "A1", "supports": "NEITHER", "relevance": "HIGH", "source_quality": "PRIMARY", "content_hash": "content"},
    ]}
    conflicting = {"policy": {"source_quality": "PRIMARY", "content_hash": "policy"}, "items": [
        {"id": "A1", "supports": "RESPONDENT", "relevance": "MEDIUM", "source_quality": "CORROBORATED", "content_hash": "content"},
    ]}
    assert module._assessments_agree(base, adjacent) is True
    assert module._assessments_agree(base, conflicting) is False

    dynamic_render = {"policy": {"source_quality": "PRIMARY", "content_hash": "different-policy-render"}, "items": [
        {"id": "A1", "supports": "CLAIMANT", "relevance": "MEDIUM", "source_quality": "CORROBORATED", "content_hash": "different-dynamic-render"},
    ]}
    assert module._assessments_agree(base, dynamic_render) is True

    unverified = {"policy": {"source_quality": "CORROBORATED", "content_hash": "policy"}, "items": [
        {"id": "A1", "supports": "NEITHER", "relevance": "MEDIUM", "source_quality": "UNVERIFIED", "content_hash": "content"},
    ]}
    assert module._assessments_agree(base, unverified, ["A1"]) is False
    unverified_consensus = {"policy": {"source_quality": "CORROBORATED", "content_hash": "other-policy"}, "items": [
        {"id": "A1", "supports": "NEITHER", "relevance": "LOW", "source_quality": "UNVERIFIED", "content_hash": "other-content"},
    ]}
    assert module._assessments_agree(unverified, unverified_consensus, ["A1"]) is True
    assert module._assessments_agree(base, adjacent, [], require_primary_policy=True) is False
    non_primary_policy = {"policy": {"source_quality": "UNVERIFIED", "content_hash": "other-policy"}, "items": [
        {"id": "A1", "supports": "NEITHER", "relevance": "LOW", "source_quality": "UNVERIFIED", "content_hash": "other-content"},
    ]}
    assert module._assessments_agree(non_primary_policy, non_primary_policy, [], require_primary_policy=True) is True


def test_preliminary_assessment_carries_content_fingerprints(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("NEITHER", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    contract.trigger_evaluation(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert set(dispute["evidence_fingerprints"].keys()) == {"A1", "A2", "B1"}
    for item in dispute["preliminary_assessment"]:
        assert isinstance(item["content_hash"], str) and len(item["content_hash"]) == 16
        assert item["content_hash"] == dispute["evidence_fingerprints"][item["id"]]
    # Distinct fetched pages receive distinct fingerprints; the dedicated
    # duplicate-content test covers the matching-hash path.
    assert len(set(dispute["evidence_fingerprints"].values())) == 3


def test_source_integrity_flags_evidence_mutated_after_preliminary_verdict(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    direct_vm.mock_web(r"https://example\.com/1$", {"status": 200, "body": "original page content"})
    direct_vm.mock_web(r"https://example\.com/2$", {"status": 200, "body": "original page content"})
    direct_vm.mock_web(r"https://example\.com/9$", {"status": 200, "body": "original page content"})
    # Register this round's response under a pattern that explicitly
    # requires CB1 to be absent, since both assessment rounds share one LLM
    # mock queue and the first registered match wins regardless of which
    # round is actually running (see the second registration below).
    preliminary_items_json = json.dumps({"policy": {"source_quality": "PRIMARY", "reason_code": "OFFICIAL_POLICY"}, "items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "source_quality": "PRIMARY", "reason_code": "TEST"}
        for item_id, (supports, relevance) in {
            "A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("NEITHER", "LOW"),
        }.items()
    ]})
    direct_vm.mock_llm(r'(?s)^(?!.*"CB1").*EVIDENCE_COURT_ASSESSMENT_V1.*$', preliminary_items_json)
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    contract.trigger_evaluation(dispute_id)
    original_fingerprint = contract.get_dispute(dispute_id)["evidence_fingerprints"]["A1"]

    direct_vm.sender = direct_bob
    contract.submit_challenge_evidence(dispute_id, bundle(99))

    direct_vm.mock_web(r"https://example\.com/99$", {"status": 200, "body": "original page content"})
    # Simulate the claimant's A1 source being edited after the preliminary
    # verdict was already formed - same URL, different content now. Web
    # mocks are first-match-wins over the registration list, so this
    # override is inserted at the front rather than appended.
    import re as _re
    direct_vm._web_mocks.insert(0, (_re.compile(r"https://example\.com/1$"), {"status": 200, "body": "edited page content, swapped after the verdict"}))
    final_items_json = json.dumps({"policy": {"source_quality": "PRIMARY", "reason_code": "OFFICIAL_POLICY"}, "items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "source_quality": "PRIMARY", "reason_code": "TEST"}
        for item_id, (supports, relevance) in {
            "A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("NEITHER", "LOW"),
            "CB1": ("RESPONDENT", "LOW"),
        }.items()
    ]})
    direct_vm.mock_llm(r'.*EVIDENCE_COURT_ASSESSMENT_V1.*"CB1".*', final_items_json)
    _warp(days=3)
    contract.finalize_dispute(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert dispute["status"] == "SETTLED"
    assert dispute["source_integrity"]["mutated_ids"] == ["A1"]
    assert dispute["evidence_fingerprints"]["A1"] == original_fingerprint
    assert dispute["final_assessment"][0]["content_hash"] != original_fingerprint


def test_compact_complete_authenticated_lifecycle_across_fixed_windows(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie,
):
    """One automated path covers the production state machine end to end.

    Production constants remain 24h/72h/48h; only the direct VM clock advances.
    """
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = STAKE
    with direct_vm.expect_revert("only the intended respondent"):
        contract.accept_dispute(dispute_id)

    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)
    contract.submit_evidence(dispute_id, bundle(9))

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {
        "A1": ("CLAIMANT", "HIGH"), "A2": ("NEITHER", "LOW"), "B1": ("RESPONDENT", "HIGH"),
    })
    contract.trigger_evaluation(dispute_id)
    assert contract.get_dispute(dispute_id)["status"] == "PRELIMINARY_VERDICT"

    direct_vm.sender = direct_alice
    contract.submit_challenge_evidence(dispute_id, bundle(20))
    direct_vm.clear_mocks()
    mock_pages_ok(direct_vm)
    direct_vm.mock_web(r"https://example\.com/20$", {"status": 200, "body": "new challenge evidence"})
    mock_assessment(direct_vm, {
        "A1": ("CLAIMANT", "HIGH"), "A2": ("NEITHER", "LOW"), "B1": ("RESPONDENT", "HIGH"),
        "CA1": ("NEITHER", "LOW"),
    })

    _warp(days=3)
    direct_vm.sender = direct_charlie  # finalization is intentionally permissionless
    contract.finalize_dispute(dispute_id)
    settled = contract.get_dispute(dispute_id)
    assert settled["status"] == "SETTLED"
    assert settled["final_verdict"]["verdict_code"] == "INCONCLUSIVE"

    direct_vm.sender = direct_alice
    contract.withdraw_credit(addr_hex(direct_alice))
    direct_vm.sender = direct_bob
    contract.withdraw_credit(addr_hex(direct_bob))
    stats = contract.get_stats()
    assert stats["dispute_escrow_atto"] == "0"
    assert stats["claimable_atto"] == "0"
    assert stats["withdrawn_atto"] == str(2 * STAKE)
    assert stats["accounting_balanced"] is True


def test_category_guidance_is_distinct_per_category_and_reaches_trigger_evaluation(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    contract_module = sys.modules["_contract_crossbench_contract"]
    CATEGORY_GUIDANCE = contract_module.CATEGORY_GUIDANCE
    CLAIM_CATEGORIES = contract_module.CLAIM_CATEGORIES

    # Every category must have its own non-empty rubric, and no two
    # categories may share text - otherwise claim_category would still be a
    # label the consensus prompt ignores rather than something that changes
    # how evidence gets weighed.
    assert set(CATEGORY_GUIDANCE.keys()) == set(CLAIM_CATEGORIES)
    assert all(isinstance(text, str) and len(text) > 20 for text in CATEGORY_GUIDANCE.values())
    assert len({text for text in CATEGORY_GUIDANCE.values()}) == len(CATEGORY_GUIDANCE)

    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob, category="FACTUAL_ACCOUNT_DISPUTE")
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("NEITHER", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    # Proves the category-guided prompt path executes end to end for a
    # non-default category without raising.
    contract.trigger_evaluation(dispute_id)
    assert contract.get_dispute(dispute_id)["claim_category"] == "FACTUAL_ACCOUNT_DISPUTE"


def test_resolve_stalled_dispute_rejected_before_attempts_or_grace_period(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    with direct_vm.expect_revert("failed consensus attempts are required"):
        contract.resolve_stalled_dispute(dispute_id)


def test_resolve_stalled_dispute_refunds_both_parties_after_repeated_failures(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))

    # No LLM/web mock installed: every trigger_evaluation attempt raises,
    # which must be caught and converted into a recorded, retryable
    # [CONSENSUS_FAILED] UserError rather than corrupting dispute state.
    for attempt in range(1, 4):
        with direct_vm.expect_revert("CONSENSUS_FAILED"):
            contract.trigger_evaluation(dispute_id)
        assert contract.get_dispute(dispute_id)["status"] == "EVIDENCE_SUBMISSION"
        assert int(contract.get_dispute(dispute_id)["eval_attempts"]) == attempt

    with direct_vm.expect_revert("grace period"):
        contract.resolve_stalled_dispute(dispute_id)

    _warp(days=7)
    assert contract.get_dispute(dispute_id)["can_resolve_stalled"] is True

    claimant_credit_before = contract.get_credit(addr_hex(direct_alice))
    respondent_credit_before = contract.get_credit(addr_hex(direct_bob))
    contract.resolve_stalled_dispute(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert dispute["status"] == "NO_CONSENSUS_REFUNDED"
    assert int(contract.get_credit(addr_hex(direct_alice))) == int(claimant_credit_before) + STAKE
    assert int(contract.get_credit(addr_hex(direct_bob))) == int(respondent_credit_before) + STAKE
    assert contract.get_stats()["no_consensus"] == "1"
    assert contract.get_stats()["accounting_balanced"] is True

    with direct_vm.expect_revert("stage that can stall"):
        contract.resolve_stalled_dispute(dispute_id)
