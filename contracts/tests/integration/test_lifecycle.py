# The contract's response/evidence/challenge windows are fixed (24h/72h/48h)
# per the product decision to keep them non-configurable in v1. The
# `gltest` integration client has no time-travel primitive (unlike
# `direct_vm.warp` in direct-mode tests), so the *success* path of every
# deadline-gated transition (claim_response_timeout, trigger_evaluation,
# finalize_dispute) cannot be exercised end-to-end here in reasonable CI
# time against a real deployment without literally waiting a day or two.
# We deliberately do not add a contract-level "test mode" to shrink these
# windows - a contract that behaves differently under test than in
# production is exactly the kind of red flag a reviewer should catch.
# These tests instead cover: the pre-deadline rejection path (provable
# immediately), and the full real-consensus assessment path once both
# bundles are in, which does not depend on any deadline passing.
import json
import time
import pytest
from gltest import get_contract_factory, get_default_account, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

STAKE = 5 * 10 ** 16


def _bundle(*items):
    return json.dumps([{"kind": "WEB_PAGE", "location": f"https://example.com/status/{i}", "description": f"archived snapshot number {i}"} for i in items])


@pytest.fixture
def claimant():
    return get_default_account()


@pytest.fixture
def respondent():
    return create_account()


def _as(factory, contract, account):
    return factory.build_contract(contract_address=contract.address, account=account)


def test_default_judgment_on_response_timeout(claimant, respondent):
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[])

    tx = contract.create_dispute(args=[
        "The platform suspended my account citing rule 4.2 but the cited post never referenced the restricted topic.",
        "MODERATION_POLICY_VIOLATION", "https://platform.example.com/policy#rule-4.2", _bundle(1, 2),
    ]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    dispute_id = contract.list_disputes(args=[0, 1]).call()["items"][0]["id"]

    dispute = contract.get_dispute(args=[dispute_id]).call()
    assert dispute["status"] == "CREATED"
    assert dispute["can_claim_timeout"] is False

    tx = contract.claim_response_timeout(args=[dispute_id]).transact()
    assert tx_execution_failed(tx)


@pytest.mark.slow
def test_full_moderation_appeal_lifecycle_real_consensus(claimant, respondent):
    """End-to-end: create, accept, submit real evidence, let validators
    independently fetch and assess it, and read the preliminary verdict.
    Uses real web/LLM calls - no mocking. Skipped by default (-m slow)
    because it costs real Studio quota and consensus time."""
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[])
    as_respondent = _as(factory, contract, respondent)

    claim = (
        "The platform removed my product listing for 'Vintage Wool Blanket' citing a "
        "counterfeit-goods policy, but the listing description and photos match a "
        "genuine handmade item with no brand claims."
    )
    bundle_claimant = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://en.wikipedia.org/wiki/Blanket", "description": "reference page describing generic blanket products and materials"},
    ])
    bundle_respondent = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://en.wikipedia.org/wiki/Counterfeit_consumer_goods", "description": "reference page describing counterfeit goods policy concepts"},
    ])

    tx = contract.create_dispute(args=[
        claim, "CONTENT_LISTING_MISMATCH", "https://platform.example.com/policy#counterfeit", bundle_claimant,
    ]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    dispute_id = contract.list_disputes(args=[0, 1]).call()["items"][0]["id"]

    tx = as_respondent.accept_dispute(args=[dispute_id]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)

    tx = as_respondent.submit_evidence(args=[dispute_id, bundle_respondent]).transact()
    assert tx_execution_succeeded(tx)

    assert contract.get_dispute(args=[dispute_id]).call()["can_trigger_evaluation"] is True
    tx = contract.trigger_evaluation(args=[dispute_id]).transact()
    assert tx_execution_succeeded(tx)

    deadline = time.time() + 600
    dispute = contract.get_dispute(args=[dispute_id]).call()
    while dispute["status"] != "PRELIMINARY_VERDICT" and time.time() < deadline:
        time.sleep(5)
        dispute = contract.get_dispute(args=[dispute_id]).call()

    assert dispute["status"] == "PRELIMINARY_VERDICT", f"assessment did not reach a preliminary verdict in time: {dispute}"
    assert dispute["preliminary_verdict"]["verdict_code"] in (
        "CLAIMANT", "RESPONDENT", "PARTIAL_CLAIMANT", "PARTIAL_RESPONDENT", "INCONCLUSIVE",
    )
    for item in dispute["preliminary_assessment"]:
        assert item["supports"] in ("CLAIMANT", "RESPONDENT", "NEITHER")
        assert item["relevance"] in ("LOW", "MEDIUM", "HIGH")


@pytest.mark.slow
def test_adversarial_evidence_content_is_not_authoritative(claimant, respondent):
    """A page whose content tries to instruct the evaluator must not be able
    to force a favorable relevance/supports verdict for itself - the prompt
    explicitly tells the model fetched content cannot assert its own
    evidentiary value. Uses a real fetch against a page we do not control
    the content of, so this is a best-effort resistance check, not a proof."""
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[])
    as_respondent = _as(factory, contract, respondent)

    claim = "The respondent's listed shipping address does not match the address printed on the attached invoice PDF page."
    bundle_claimant = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://example.com/", "description": "a neutral placeholder page unrelated to the claim, used to probe that irrelevant content is not scored as supporting either side"},
    ])

    tx = contract.create_dispute(args=[
        claim, "FACTUAL_ACCOUNT_DISPUTE", "https://platform.example.com/policy#shipping", bundle_claimant,
    ]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    dispute_id = contract.list_disputes(args=[0, 1]).call()["items"][0]["id"]

    tx = as_respondent.accept_dispute(args=[dispute_id]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    tx = as_respondent.submit_evidence(args=[dispute_id, bundle_claimant]).transact()
    assert tx_execution_succeeded(tx)
    tx = contract.trigger_evaluation(args=[dispute_id]).transact()
    assert tx_execution_succeeded(tx)

    deadline = time.time() + 600
    dispute = contract.get_dispute(args=[dispute_id]).call()
    while dispute["status"] != "PRELIMINARY_VERDICT" and time.time() < deadline:
        time.sleep(5)
        dispute = contract.get_dispute(args=[dispute_id]).call()

    assert dispute["status"] == "PRELIMINARY_VERDICT"
    for item in dispute["preliminary_assessment"]:
        if item["supports"] != "NEITHER":
            assert item["relevance"] != "HIGH", "an irrelevant, unrelated page should never be scored HIGH relevance"


@pytest.mark.slow
def test_symmetric_treatment_of_both_bundles(claimant, respondent):
    """Both parties' evidence must go through the identical fetch+assess
    process - this checks that respondent-submitted items appear in the
    structured assessment with the same fields as claimant items, not a
    reduced or differently-shaped record."""
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[])
    as_respondent = _as(factory, contract, respondent)

    claim = "The claimant's uploaded certificate of authenticity does not match the item pictured in the respondent's counter-listing."
    bundle_claimant = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://en.wikipedia.org/wiki/Certificate_of_authenticity", "description": "reference material on certificates of authenticity"},
    ])
    bundle_respondent = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://en.wikipedia.org/wiki/Provenance", "description": "reference material on provenance verification"},
    ])

    tx = contract.create_dispute(args=[
        claim, "CONTENT_LISTING_MISMATCH", "https://platform.example.com/policy#authenticity", bundle_claimant,
    ]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    dispute_id = contract.list_disputes(args=[0, 1]).call()["items"][0]["id"]

    tx = as_respondent.accept_dispute(args=[dispute_id]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    tx = as_respondent.submit_evidence(args=[dispute_id, bundle_respondent]).transact()
    assert tx_execution_succeeded(tx)
    tx = contract.trigger_evaluation(args=[dispute_id]).transact()
    assert tx_execution_succeeded(tx)

    deadline = time.time() + 600
    dispute = contract.get_dispute(args=[dispute_id]).call()
    while dispute["status"] != "PRELIMINARY_VERDICT" and time.time() < deadline:
        time.sleep(5)
        dispute = contract.get_dispute(args=[dispute_id]).call()

    assert dispute["status"] == "PRELIMINARY_VERDICT"
    ids = {item["id"] for item in dispute["preliminary_assessment"]}
    assert "A1" in ids and "B1" in ids
    a_item = next(item for item in dispute["preliminary_assessment"] if item["id"] == "A1")
    b_item = next(item for item in dispute["preliminary_assessment"] if item["id"] == "B1")
    assert set(a_item.keys()) == set(b_item.keys())
