import json

CONTRACT = "contracts/crossbench_contract.py"
STAKE = 5 * 10 ** 16


def bundle(*items):
    return json.dumps([{"kind": "WEB_PAGE", "location": f"https://example.com/{i}", "description": f"evidence item number {i}"} for i in items])


def mock_assessment(direct_vm, mapping):
    items_json = json.dumps({"items": [
        {"id": item_id, "supports": supports, "relevance": relevance, "reason_code": "TEST"}
        for item_id, (supports, relevance) in mapping.items()
    ]})
    direct_vm.mock_llm(r".*EVIDENCE_COURT_ASSESSMENT_V1.*", items_json)


def mock_pages_ok(direct_vm):
    direct_vm.mock_web(r"https://example\.com/.*", {"status": 200, "body": "page content"})


def addr_hex(value):
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    return str(value)
