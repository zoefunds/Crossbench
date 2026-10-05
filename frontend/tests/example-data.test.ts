import assert from "node:assert/strict";
import test from "node:test";
import { isValidEvidenceItem } from "../components/EvidenceBundleEditor";
import { DISPUTE_EXAMPLES } from "../lib/exampleData";

const categories = new Set([
  "MODERATION_POLICY_VIOLATION",
  "MODERATION_WRONGFUL_ACTION",
  "CONTENT_LISTING_MISMATCH",
  "FACTUAL_ACCOUNT_DISPUTE",
]);

test("autofill examples satisfy the contract's structural limits", () => {
  assert.ok(DISPUTE_EXAMPLES.length > 0);
  for (const example of DISPUTE_EXAMPLES) {
    assert.ok(categories.has(example.category));
    assert.ok(example.claim.trim().length >= 40 && example.claim.trim().length <= 1800);
    assert.ok(example.policyReference.trim().length >= 8 && example.policyReference.trim().length <= 800);
    for (const bundle of [example.claimantItems, example.respondentItems]) {
      assert.ok(bundle.length >= 1 && bundle.length <= 3);
      assert.ok(bundle.every(isValidEvidenceItem));
    }
  }
});

test("evidence validation rejects sources validators must not fetch", () => {
  const description = "A sufficiently detailed evidence description.";
  for (const location of [
    "http://example.com/evidence",
    "https://localhost/evidence",
    "https://service.local/evidence",
    "https://127.0.0.1/evidence",
    "https://172.16.0.1/evidence",
    "https://[::1]/evidence",
    "https://user:password@example.com/evidence",
  ]) {
    assert.equal(isValidEvidenceItem({ kind: "WEB_PAGE", location, description }), false, location);
  }
});
