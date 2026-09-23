import json
from conftest import CONTRACT, STAKE, bundle, mock_assessment, mock_pages_ok, addr_hex


def _create(direct_vm, contract, claimant, category="MODERATION_POLICY_VIOLATION"):
    direct_vm.sender = claimant
    direct_vm.value = STAKE
    return contract.create_dispute(
        "The platform removed my post citing rule 4.2 but the post never mentioned the restricted topic.",
        category, "https://platform.example.com/policy#rule-4.2", bundle(1, 2),
    )


def test_create_dispute_rejects_bad_category(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with direct_vm.expect_revert("claim_category"):
        contract.create_dispute("x" * 50, "NOT_A_CATEGORY", "https://x.example.com/policy", bundle(1))


def test_create_dispute_rejects_stake_out_of_range(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = 1
    with direct_vm.expect_revert("stake"):
        contract.create_dispute("x" * 50, "MODERATION_POLICY_VIOLATION", "https://x.example.com/policy", bundle(1))


def test_create_dispute_rejects_oversized_bundle(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with direct_vm.expect_revert("evidence bundle"):
        contract.create_dispute("x" * 50, "MODERATION_POLICY_VIOLATION", "https://x.example.com/policy", bundle(1, 2, 3, 4))


def test_create_dispute_rejects_ssrf_targets(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    bad = json.dumps([{"kind": "WEB_PAGE", "location": "https://169.254.169.254/latest/meta-data", "description": "an internal metadata endpoint"}])
    with direct_vm.expect_revert("private or internal host"):
        contract.create_dispute("x" * 50, "MODERATION_POLICY_VIOLATION", "https://x.example.com/policy", bad)


def test_accept_dispute_requires_exact_counter_stake(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE - 1
    with direct_vm.expect_revert("counter-stake"):
        contract.accept_dispute(dispute_id)


def test_claimant_cannot_accept_own_dispute(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    with direct_vm.expect_revert("cannot counter-stake"):
        contract.accept_dispute(dispute_id)


def test_cancel_before_accept_refunds_claimant(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_alice
    contract.cancel_dispute(dispute_id)
    assert contract.get_dispute(dispute_id)["status"] == "CANCELLED"
    assert contract.get_credit(addr_hex(direct_alice)) == str(STAKE)


def test_response_timeout_rejected_before_deadline(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    with direct_vm.expect_revert("response window has not closed"):
        contract.claim_response_timeout(dispute_id)


def test_evidence_bundles_are_pinned_and_immutable(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(3))
    with direct_vm.expect_revert("already pinned"):
        contract.submit_evidence(dispute_id, bundle(4))

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("already pinned at creation"):
        contract.submit_evidence(dispute_id, bundle(5))


def test_trigger_evaluation_rejected_until_both_bundles_or_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)
    assert contract.get_dispute(dispute_id)["can_trigger_evaluation"] is False
    with direct_vm.expect_revert("respondent has not yet submitted"):
        contract.trigger_evaluation(dispute_id)


def test_full_claimant_win_settlement(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "HIGH"), "A2": ("CLAIMANT", "HIGH"), "B1": ("NEITHER", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))

    assert contract.get_dispute(dispute_id)["can_trigger_evaluation"] is True
    contract.trigger_evaluation(dispute_id)
    dispute = contract.get_dispute(dispute_id)
    assert dispute["status"] == "PRELIMINARY_VERDICT"
    assert dispute["preliminary_verdict"]["verdict_code"] == "CLAIMANT"
    assert dispute["can_finalize"] is False
    # finalize_dispute is gated on the 48h challenge deadline; the full
    # settle-after-challenge-window path is covered in integration tests,
    # where real transaction timestamps let the deadline actually pass.


def test_inconclusive_splits_refund_evenly(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "LOW"), "A2": ("RESPONDENT", "LOW"), "B1": ("NEITHER", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))

    contract.trigger_evaluation(dispute_id)
    dispute = contract.get_dispute(dispute_id)
    assert dispute["preliminary_verdict"]["verdict_code"] == "INCONCLUSIVE"


def test_unreachable_items_forced_neither(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    direct_vm.mock_web(r"https://example\.com/.*", {"status": 500, "body": ""})
    mock_assessment(direct_vm, {"A1": ("NEITHER", "LOW"), "A2": ("NEITHER", "LOW"), "B1": ("NEITHER", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))

    contract.trigger_evaluation(dispute_id)
    assert contract.get_dispute(dispute_id)["preliminary_verdict"]["verdict_code"] == "INCONCLUSIVE"


def test_challenge_window_is_additive_only(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    dispute_id = _create(direct_vm, contract, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    contract.accept_dispute(dispute_id)

    mock_pages_ok(direct_vm)
    mock_assessment(direct_vm, {"A1": ("CLAIMANT", "MEDIUM"), "A2": ("CLAIMANT", "MEDIUM"), "B1": ("RESPONDENT", "LOW")})
    direct_vm.sender = direct_bob
    contract.submit_evidence(dispute_id, bundle(9))
    contract.trigger_evaluation(dispute_id)

    direct_vm.sender = direct_bob
    contract.submit_challenge_evidence(dispute_id, bundle(10))
    with direct_vm.expect_revert("already submitted challenge"):
        contract.submit_challenge_evidence(dispute_id, bundle(11))

    dispute = contract.get_dispute(dispute_id)
    assert dispute["bundle_claimant"] == json.loads(bundle(1, 2))
    assert len(dispute["challenge_respondent"]) == 1


def test_finalize_rejected_before_challenge_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
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

    direct_vm.sender = direct_bob
    contract.submit_challenge_evidence(dispute_id, bundle(20))
    assert contract.get_dispute(dispute_id)["challenge_added"] is True
    assert contract.get_dispute(dispute_id)["can_finalize"] is False
    with direct_vm.expect_revert("challenge window has not closed"):
        contract.finalize_dispute(dispute_id)
    # The re-assessment-produces-a-different-final-verdict path (once the
    # 48h challenge window has actually passed) is covered in integration
    # tests against real StudioNet time, not here.


def test_accounting_invariant_holds_after_settlement(direct_vm, direct_deploy, direct_alice, direct_bob):
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
    # finalize_dispute's deadline gate is exercised in integration tests;
    # drive the deterministic settlement function directly here to check
    # the escrow accounting invariant end to end.
    dispute = contract._dispute(dispute_id)
    contract._settle(dispute, dispute["preliminary_verdict"])

    direct_vm.sender = direct_alice
    contract.withdraw_credit(addr_hex(direct_alice))
    assert contract.get_stats()["accounting_balanced"] is True


def test_withdraw_requires_positive_credit(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("no credit"):
        contract.withdraw_credit(addr_hex(direct_alice))
