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
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import pytest
from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

STAKE = 5 * 10 ** 16
PRODUCTION_CONTRACT = os.environ.get("CROSSBENCH_PRODUCTION_CONTRACT", "0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6")

ETHEREUM_BLOCK_POLICY = "https://ethereum.org/en/developers/docs/blocks/"
ETHEREUM_HISTORY = "https://ethereum.org/en/history/"
ETHEREUM_GENESIS_REFERENCE = "https://eth.blockscout.com/api/v2/blocks/0"


def _bundle(*items):
    sources = [
        {"kind": "WEB_PAGE", "location": ETHEREUM_HISTORY, "description": "Ethereum Foundation history page documenting the mainnet launch date and early network history."},
        {"kind": "ONCHAIN_REF", "location": ETHEREUM_GENESIS_REFERENCE, "description": "Blockscout's Ethereum mainnet record for genesis block 0, including its immutable block hash, gas fields, and transaction count."},
    ]
    return json.dumps([sources[i - 1] for i in items])


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
        "Ethereum mainnet began with block 0 on 30 July 2015, rather than on 31 July 2015 as the opposing account states.",
        "FACTUAL_ACCOUNT_DISPUTE", ETHEREUM_BLOCK_POLICY, _bundle(1, 2),
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

    claim = "Ethereum mainnet began with genesis block 0 on 30 July 2015; the opposing account's date of 31 July 2015 is incorrect."
    bundle_claimant = json.dumps([
        {"kind": "WEB_PAGE", "location": ETHEREUM_HISTORY, "description": "Ethereum Foundation history page documenting the Frontier mainnet launch on 30 July 2015."},
    ])
    bundle_respondent = json.dumps([
        {"kind": "ONCHAIN_REF", "location": ETHEREUM_GENESIS_REFERENCE, "description": "Blockscout's Ethereum mainnet record for genesis block 0, including its immutable block hash, gas fields, and transaction count."},
    ])

    tx = contract.create_dispute(args=[
        claim, "FACTUAL_ACCOUNT_DISPUTE", ETHEREUM_BLOCK_POLICY, bundle_claimant,
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
        assert item["source_quality"] in ("UNVERIFIED", "CORROBORATED", "PRIMARY")
    assert dispute["policy_assessment"]["source_quality"] in ("CORROBORATED", "PRIMARY")
    assert dispute["source_integrity"]["duplicate_ids"] == []


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
        "kind": "WEB_PAGE", "location": ETHEREUM_HISTORY,
        "description": "Ethereum Foundation history page documenting the Frontier mainnet launch on 30 July 2015.",
    }])
    respondent_bundle = json.dumps([{
        "kind": "ONCHAIN_REF", "location": ETHEREUM_GENESIS_REFERENCE,
        "description": "Blockscout's Ethereum mainnet record for genesis block 0, including its immutable block hash, gas fields, and transaction count.",
    }])
    claim = "LIVE CONSENSUS VERIFICATION: Ethereum mainnet began with genesis block 0 on 30 July 2015, not 31 July 2015."
    _write_retry(
        lambda: contract.create_dispute(args=[
            claim, "FACTUAL_ACCOUNT_DISPUTE", ETHEREUM_BLOCK_POLICY, claimant_bundle,
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
    assert dispute["policy_assessment"]["source_quality"] in ("CORROBORATED", "PRIMARY")
    assert dispute["source_integrity"]["duplicate_ids"] == []
    qualities = [item["source_quality"] for item in dispute["preliminary_assessment"]]
    assert any(quality in ("CORROBORATED", "PRIMARY") for quality in qualities)
    # A submitted URL is not presumed trustworthy: unavailable or mismatched
    # evidence must remain visible in the audit trail as UNVERIFIED and cannot
    # contribute verdict weight. The direct contract tests prove that weighting
    # rule for every support/relevance combination.
    assert all(item["source_quality"] in ("UNVERIFIED", "CORROBORATED", "PRIMARY") for item in dispute["preliminary_assessment"])
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
        {"kind": "WEB_PAGE", "location": "https://www.iana.org/help/example-domains", "description": "IANA documentation about reserved example domains, unrelated to the shipping-address claim."},
    ])
    bundle_respondent = json.dumps([
        {"kind": "WEB_PAGE", "location": "https://www.iana.org/domains/reserved", "description": "IANA registry page for reserved domains, also unrelated to the shipping-address claim."},
    ])

    tx = contract.create_dispute(args=[
        claim, "FACTUAL_ACCOUNT_DISPUTE", "https://www.iana.org/help/example-domains", bundle_claimant,
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
        claim, "CONTENT_LISTING_MISMATCH", "https://www.wipo.int/web/traditional-knowledge/provenance-disclosures", bundle_claimant,
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
