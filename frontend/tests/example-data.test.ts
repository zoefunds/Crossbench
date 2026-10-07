import assert from "node:assert/strict";
import test from "node:test";
import { hasDuplicateEvidenceLocations, isValidEvidenceItem, isValidPublicSourceUrl } from "../components/EvidenceBundleEditor";
import { demoRespondentFor, DISPUTE_EXAMPLES, isValidIntendedRespondent } from "../lib/exampleData";

const categories = new Set([
  "MODERATION_POLICY_VIOLATION",
  "MODERATION_WRONGFUL_ACTION",
  "CONTENT_LISTING_MISMATCH",
  "FACTUAL_ACCOUNT_DISPUTE",
]);

test("autofill examples satisfy the contract's structural limits", () => {
  assert.ok(DISPUTE_EXAMPLES.length > 0);
  assert.deepEqual(new Set(DISPUTE_EXAMPLES.map((example) => example.category)), categories);
  for (const example of DISPUTE_EXAMPLES) {
    assert.ok(categories.has(example.category));
    assert.ok(example.claim.trim().length >= 40 && example.claim.trim().length <= 1800);
    assert.ok(isValidPublicSourceUrl(example.policyReference));
    assert.ok(example.policyIssuer.trim().length >= 2 && example.policyIssuer.trim().length <= 160);
    for (const bundle of [example.claimantItems, example.respondentItems, example.claimantChallengeItems, example.respondentChallengeItems]) {
      assert.ok(bundle.length >= 1 && bundle.length <= 3);
      assert.ok(bundle.every(isValidEvidenceItem));
      assert.equal(hasDuplicateEvidenceLocations(bundle), false);
    }
    assert.equal(hasDuplicateEvidenceLocations([
      ...example.claimantItems,
      ...example.respondentItems,
      ...example.claimantChallengeItems,
      ...example.respondentChallengeItems,
    ]), false);
  }
});

test("creation autofill always chooses a valid respondent different from the claimant", () => {
  const first = demoRespondentFor();
  assert.match(first, /^0x[0-9a-fA-F]{40}$/);
  const alternate = demoRespondentFor(first);
  assert.match(alternate, /^0x[0-9a-fA-F]{40}$/);
  assert.notEqual(alternate.toLowerCase(), first.toLowerCase());
  assert.equal(isValidIntendedRespondent(alternate, first), true);
  assert.equal(isValidIntendedRespondent(first, first), false);
  assert.equal(isValidIntendedRespondent("0x1234", first), false);
});

test("on-chain evidence requires structured identity and deduplicates across explorers", () => {
  const base = {
    kind: "ONCHAIN_REF" as const,
    description: "Ethereum mainnet block forty-two from a public explorer.",
    chain_id: "eip155:1",
    reference_type: "BLOCK" as const,
    reference_value: "42",
  };
  const first = { ...base, location: "https://explorer-one.example/block/42" };
  const second = { ...base, location: "https://explorer-two.example/blocks/42" };
  assert.equal(isValidEvidenceItem(first), true);
  assert.equal(isValidEvidenceItem({ ...first, chain_id: undefined }), false);
  assert.equal(isValidEvidenceItem({ ...first, reference_value: "" }), false);
  assert.equal(hasDuplicateEvidenceLocations([first, second]), true);
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
    "https://bit.ly/evidence",
    "https://raw.pastebin.com/evidence",
  ]) {
    assert.equal(isValidEvidenceItem({ kind: "WEB_PAGE", location, description }), false, location);
  }
});
