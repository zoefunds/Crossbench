import json
import sys
from gltest_cli.config.general import get_general_config
from gltest.clients import get_gl_client
from gltest.accounts import get_default_account, create_account
from genlayer_py.types import Address

CONTRACT = "0xdC35E20AE1e63f21555BA929b8a73867e23ca602"
STAKE = 5 * 10 ** 16


def bundle(desc):
    return json.dumps([{"kind": "WEB_PAGE", "location": "https://en.wikipedia.org/wiki/Blanket", "description": desc}])


def main():
    claimant = get_default_account()
    respondent = create_account()
    client = get_gl_client()

    print("create_dispute...", flush=True)
    tx_hash = client.write_contract(
        address=CONTRACT, function_name="create_dispute", account=claimant, value=STAKE,
        args=["A test claim for direct CLI investigation of the trigger_evaluation stall, forty plus chars.",
              "CONTENT_LISTING_MISMATCH", "https://platform.example.com/policy#x", bundle("claimant item")],
    )
    receipt = client.wait_for_transaction_receipt(hash=tx_hash)
    print("create_dispute status:", receipt.get("status_name"), flush=True)
    dispute_id = client.read_contract(address=CONTRACT, function_name="list_disputes", args=[0, 1])["items"][0]["id"]
    print("dispute_id:", dispute_id, flush=True)

    print("accept_dispute...", flush=True)
    tx_hash = client.write_contract(address=CONTRACT, function_name="accept_dispute", account=respondent, value=STAKE, args=[dispute_id])
    receipt = client.wait_for_transaction_receipt(hash=tx_hash)
    print("accept_dispute status:", receipt.get("status_name"), flush=True)

    print("submit_evidence...", flush=True)
    tx_hash = client.write_contract(address=CONTRACT, function_name="submit_evidence", account=respondent, args=[dispute_id, bundle("respondent item")])
    receipt = client.wait_for_transaction_receipt(hash=tx_hash)
    print("submit_evidence status:", receipt.get("status_name"), flush=True)

    print("trigger_evaluation...", flush=True)
    tx_hash = client.write_contract(address=CONTRACT, function_name="trigger_evaluation", account=claimant, args=[dispute_id])
    print("TRIGGER_EVAL_TX_HASH:", tx_hash, flush=True)
    receipt = client.wait_for_transaction_receipt(hash=tx_hash, retries=80, interval=5000)
    print("trigger_evaluation status:", receipt.get("status_name"), flush=True)
    print(json.dumps(receipt, default=str)[:4000], flush=True)

    dispute = client.read_contract(address=CONTRACT, function_name="get_dispute", args=[dispute_id])
    print("FINAL DISPUTE STATE:", json.dumps(dispute, default=str), flush=True)


if __name__ == "__main__":
    main()
