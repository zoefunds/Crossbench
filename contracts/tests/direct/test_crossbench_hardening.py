import sys
import json
from datetime import datetime, timedelta, timezone
from conftest import CONTRACT, STAKE, bundle, mock_assessment, mock_pages_ok, addr_hex


def _create(direct_vm, contract, claimant, category="MODERATION_POLICY_VIOLATION"):
    direct_vm.sender = claimant
    direct_vm.value = STAKE
    return contract.create_dispute(
        "The platform removed my post citing rule 4.2 but the post never mentioned the restricted topic.",
        category, "https://platform.example.com/policy#rule-4.2", bundle(1, 2),
    )


def _warp(days: int) -> None:
    gl_mod = sys.modules.get("genlayer.gl")
    assert gl_mod is not None, "contract module must already be loaded"
    future = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")
    gl_mod.message_raw["datetime"] = future


def test_shortener_and_paste_hosts_rejected_as_evidence(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    bad_bundle = json.dumps([{"kind": "WEB_PAGE", "location": "https://bit.ly/abc123", "description": "shortened link to the policy page"}])
    with direct_vm.expect_revert("link shortener"):
        contract.create_dispute("x" * 40, "MODERATION_POLICY_VIOLATION", "y" * 8, bad_bundle)


def test_paste_subdomain_also_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    bad_bundle = json.dumps([{"kind": "ONCHAIN_REF", "location": "https://mirror.pastebin.com/raw/abc", "description": "mirrored explorer dump"}])
    with direct_vm.expect_revert("link shortener"):
        contract.create_dispute("x" * 40, "MODERATION_POLICY_VIOLATION", "y" * 8, bad_bundle)


def test_preliminary_assessment_carries_content_fingerprints(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
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
    # Same mocked page content for every item -> identical fingerprint,
    # proving the hash is a real function of fetched content, not a
    # per-item nonce or the id itself.
    assert len(set(dispute["evidence_fingerprints"].values())) == 1


def test_source_integrity_flags_evidence_mutated_after_preliminary_verdict(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
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
    preliminary_items_json = json.dumps({"items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "reason_code": "TEST"}
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
    final_items_json = json.dumps({"items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "reason_code": "TEST"}
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

    dispute_id = _create(direct_vm, contract, direct_alice, category="FACTUAL_ACCOUNT_DISPUTE")
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
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    with direct_vm.expect_revert("failed consensus attempts are required"):
        contract.resolve_stalled_dispute(dispute_id)


def test_resolve_stalled_dispute_refunds_both_parties_after_repeated_failures(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
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
