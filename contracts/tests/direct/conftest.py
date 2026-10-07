import json

CONTRACT = "contracts/crossbench_contract.py"
STAKE = 5 * 10 ** 16


def bundle(*items):
    return json.dumps([{"kind": "WEB_PAGE", "location": f"https://example.com/{i}", "description": f"evidence item number {i}"} for i in items])


def onchain_bundle(location: str, chain_id: str, reference_type: str, reference_value: str, description: str = "independently verifiable ledger reference"):
    return json.dumps([{
        "kind": "ONCHAIN_REF", "location": location, "description": description,
        "chain_id": chain_id, "reference_type": reference_type, "reference_value": reference_value,
    }])


def mock_assessment(direct_vm, mapping):
    items_json = json.dumps({"policy": {"source_quality": "PRIMARY", "reason_code": "OFFICIAL_POLICY"}, "items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "source_quality": "PRIMARY", "reason_code": "TEST"}
        for item_id, (supports, relevance) in mapping.items()
    ]})
    direct_vm.mock_llm(r".*EVIDENCE_COURT_ASSESSMENT_V1.*", items_json)


def mock_pages_ok(direct_vm):
    for item in range(1, 101):
        direct_vm.mock_web(rf"https://example\.com/{item}$", {"status": 200, "body": f"distinct page content {item}"})
    direct_vm.mock_web(r"https://platform\.example\.com/policy.*", {"status": 200, "body": "official platform policy rule 4.2"})


def addr_hex(value):
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    return str(value)
