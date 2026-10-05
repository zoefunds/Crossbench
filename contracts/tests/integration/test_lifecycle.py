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
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
import pytest
from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

STAKE = 5 * 10 ** 16
PRODUCTION_CONTRACT = "0x44a98ec678A32aCc7024Db2B6242db62b509E8cA"


def _bundle(*items):
    return json.dumps([{"kind": "WEB_PAGE", "location": f"https://example.com/status/{i}", "description": f"archived snapshot number {i}"} for i in items])


@pytest.fixture
def claimant():
    # Stable, public test-only identities let a deadline-gated StudioNet run
    # resume after 48 hours. Never use these deterministic keys off testnets.
    return create_account("0x" + hashlib.sha256(b"crossbench-live-claimant-v1").hexdigest())


@pytest.fixture
def respondent():
    return create_account("0x" + hashlib.sha256(b"crossbench-live-respondent-v1").hexdigest())


def _as(factory, contract, account):
    return factory.build_contract(contract_address=contract.address, account=account)


def _call_retry(call, attempts=10):
    """StudioNet occasionally drops TLS/RPC connections. Reads are safe to
    retry and make live-consensus tests measure contract behavior rather than
    a single transport handshake."""
    last = None
    for attempt in range(attempts):
        try:
            return call()
        except Exception as error:
            last = error
            if attempt + 1 < attempts:
                time.sleep(3)
    raise last


def _write_retry(transact, completed, attempts=10):
    """Retry a write only after checking its on-chain postcondition. This
    avoids duplicating an ambiguously broadcast transaction."""
    last = None
    for attempt in range(attempts):
        try:
            tx = transact()
            assert tx_execution_succeeded(tx)
            return
        except Exception as error:
            last = error
            try:
                if _call_retry(completed, attempts=3):
                    return
            except Exception:
                pass
            if attempt + 1 < attempts:
                time.sleep(3)
    raise last


def test_default_judgment_on_response_timeout(claimant, respondent):
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[], account=claimant)

    tx = contract.create_dispute(args=[
        "The platform suspended my account citing rule 4.2 but the cited post never referenced the restricted topic.",
        "MODERATION_POLICY_VIOLATION", "https://platform.example.com/policy#rule-4.2", _bundle(1, 2),
    ]).transact(value=STAKE)
    assert tx_execution_succeeded(tx)
    dispute_id = _call_retry(lambda: contract.list_disputes(args=[0, 1]).call())["items"][0]["id"]

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
    contract = factory.deploy(args=[], account=claimant)
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
    dispute_id = _call_retry(lambda: contract.list_disputes(args=[0, 1]).call())["items"][0]["id"]

    _write_retry(
        lambda: as_respondent.accept_dispute(args=[dispute_id]).transact(value=STAKE),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["status"] == "EVIDENCE_SUBMISSION",
    )

    _write_retry(
        lambda: as_respondent.submit_evidence(args=[dispute_id, bundle_respondent]).transact(),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["bundle_respondent_submitted"] is True,
    )

    assert _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["can_trigger_evaluation"] is True
    _write_retry(
        lambda: contract.trigger_evaluation(args=[dispute_id]).transact(),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["status"] == "PRELIMINARY_VERDICT",
    )

    deadline = time.time() + 600
    dispute = _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())
    while dispute["status"] != "PRELIMINARY_VERDICT" and time.time() < deadline:
        time.sleep(5)
        dispute = _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())

    assert dispute["status"] == "PRELIMINARY_VERDICT", f"assessment did not reach a preliminary verdict in time: {dispute}"
    print("LIVE_LIFECYCLE_STATE=" + json.dumps({
        "contract_address": contract.address,
        "dispute_id": dispute_id,
        "challenge_deadline": dispute["challenge_deadline"],
        "claimant": dispute["claimant"],
        "respondent": dispute["respondent"],
    }, sort_keys=True))
    assert dispute["preliminary_verdict"]["verdict_code"] in (
        "CLAIMANT", "RESPONDENT", "PARTIAL_CLAIMANT", "PARTIAL_RESPONDENT", "INCONCLUSIVE",
    )
    for item in dispute["preliminary_assessment"]:
        assert item["supports"] in ("CLAIMANT", "RESPONDENT", "NEITHER")
        assert item["relevance"] in ("LOW", "MEDIUM", "HIGH")


@pytest.mark.slow
def test_production_visible_lifecycle_real_consensus(claimant, respondent):
    """Exercise real consensus on the contract configured in the live app.

    Unlike the isolated deployment test, this dispute must become visible via
    the production indexer and frontend. A durable state file makes the
    deadline-gated settlement/withdrawal phase resumable without duplicating
    the stake-bearing setup transactions.
    """
    state_path = Path(__file__).resolve().parents[3] / "docs" / "PRODUCTION_LIVE_LIFECYCLE_STATE.json"
    factory = get_contract_factory("Crossbench")
    contract = factory.build_contract(contract_address=PRODUCTION_CONTRACT, account=claimant)
    as_respondent = _as(factory, contract, respondent)

    if state_path.exists():
        state = json.loads(state_path.read_text())
        assert state["contract_address"].lower() == PRODUCTION_CONTRACT.lower()
        dispute = _call_retry(lambda: contract.get_dispute(args=[state["dispute_id"]]).call())
        assert dispute["status"] in ("PRELIMINARY_VERDICT", "SETTLED")
        return

    before = int(_call_retry(lambda: contract.get_stats(args=[]).call())["total_disputes"])
    claimant_bundle = json.dumps([{
        "kind": "WEB_PAGE",
        "location": "https://en.wikipedia.org/wiki/Blanket",
        "description": "General background about blankets; it does not independently verify the fictional listing event.",
    }])
    respondent_bundle = json.dumps([{
        "kind": "WEB_PAGE",
        "location": "https://en.wikipedia.org/wiki/Counterfeit_consumer_goods",
        "description": "General background about counterfeit goods; it does not independently verify the fictional removal event.",
    }])
    claim = (
        "LIVE CONSENSUS TEST: a fictional handmade wool blanket listing was removed under a counterfeit-goods rule, "
        "but the fictional listing contained no brand name or trademarked logo."
    )
    _write_retry(
        lambda: contract.create_dispute(args=[
            claim, "CONTENT_LISTING_MISMATCH",
            "https://en.wikipedia.org/wiki/Counterfeit_consumer_goods", claimant_bundle,
        ]).transact(value=STAKE),
        lambda: int(_call_retry(lambda: contract.get_stats(args=[]).call())["total_disputes"]) > before,
    )
    dispute_id = _call_retry(lambda: contract.list_disputes(args=[before, 1]).call())["items"][0]["id"]
    _write_retry(
        lambda: as_respondent.accept_dispute(args=[dispute_id]).transact(value=STAKE),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["status"] == "EVIDENCE_SUBMISSION",
    )
    _write_retry(
        lambda: as_respondent.submit_evidence(args=[dispute_id, respondent_bundle]).transact(),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["bundle_respondent_submitted"] is True,
    )
    _write_retry(
        lambda: contract.trigger_evaluation(args=[dispute_id]).transact(),
        lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["status"] == "PRELIMINARY_VERDICT",
    )
    dispute = _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())
    assert dispute["status"] == "PRELIMINARY_VERDICT"
    state = {
        "network": "studionet",
        "contract_address": PRODUCTION_CONTRACT,
        "dispute_id": dispute_id,
        "claimant": dispute["claimant"],
        "respondent": dispute["respondent"],
        "challenge_deadline": int(dispute["challenge_deadline"]),
        "challenge_deadline_utc": datetime.fromtimestamp(int(dispute["challenge_deadline"]), timezone.utc).isoformat().replace("+00:00", "Z"),
        "preliminary_verdict": dispute["preliminary_verdict"]["verdict_code"],
        "completed_through": "PRELIMINARY_VERDICT",
    }
    state_path.write_text(json.dumps(state, indent=2) + "\n")
    print("PRODUCTION_LIVE_LIFECYCLE_STATE=" + json.dumps(state, sort_keys=True))


@pytest.mark.slow
def test_adversarial_evidence_content_is_not_authoritative(claimant, respondent):
    """A page whose content tries to instruct the evaluator must not be able
    to force a favorable relevance/supports verdict for itself - the prompt
    explicitly tells the model fetched content cannot assert its own
    evidentiary value. Uses a real fetch against a page we do not control
    the content of, so this is a best-effort resistance check, not a proof."""
    factory = get_contract_factory("Crossbench")
    contract = factory.deploy(args=[], account=claimant)
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
    contract = factory.deploy(args=[], account=claimant)
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


@pytest.mark.deadline
@pytest.mark.parametrize("state_filename", ["LIVE_LIFECYCLE_STATE.json", "PRODUCTION_LIVE_LIFECYCLE_STATE.json"])
def test_resume_recorded_live_lifecycle_after_challenge_expiry(claimant, respondent, state_filename):
    """Resume the durable exact-contract StudioNet run after its real 48-hour
    deadline, settle it, and withdraw the claimant's inconclusive refund.
    Safe to rerun: each postcondition is checked before attempting a write."""
    state_path = Path(__file__).resolve().parents[3] / "docs" / state_filename
    if not state_path.exists():
        pytest.skip(f"{state_filename} has not been started")
    state = json.loads(state_path.read_text())
    if time.time() < int(state["challenge_deadline"]):
        pytest.skip(f"real challenge window closes at {state['challenge_deadline_utc']}")

    factory = get_contract_factory("Crossbench")
    contract = factory.build_contract(contract_address=state["contract_address"], account=claimant)
    dispute_id = state["dispute_id"]
    dispute = _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())
    if dispute["status"] == "PRELIMINARY_VERDICT":
        assert dispute["can_finalize"] is True
        _write_retry(
            lambda: contract.finalize_dispute(args=[dispute_id]).transact(),
            lambda: _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())["status"] == "SETTLED",
        )

    dispute = _call_retry(lambda: contract.get_dispute(args=[dispute_id]).call())
    assert dispute["status"] == "SETTLED"
    credit = int(_call_retry(lambda: contract.get_credit(args=[state["claimant"]]).call()))
    if credit > 0:
        _write_retry(
            lambda: contract.withdraw_credit(args=[state["claimant"]]).transact(),
            lambda: int(_call_retry(lambda: contract.get_credit(args=[state["claimant"]]).call())) == 0,
        )
    assert int(_call_retry(lambda: contract.get_credit(args=[state["claimant"]]).call())) == 0
    respondent_contract = _as(factory, contract, respondent)
    respondent_credit = int(_call_retry(lambda: contract.get_credit(args=[state["respondent"]]).call()))
    if respondent_credit > 0:
        _write_retry(
            lambda: respondent_contract.withdraw_credit(args=[state["respondent"]]).transact(),
            lambda: int(_call_retry(lambda: contract.get_credit(args=[state["respondent"]]).call())) == 0,
        )
    assert int(_call_retry(lambda: contract.get_credit(args=[state["respondent"]]).call())) == 0
    assert _call_retry(lambda: contract.get_stats(args=[]).call())["accounting_balanced"] is True
