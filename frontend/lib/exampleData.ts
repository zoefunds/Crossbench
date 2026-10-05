import type { EvidenceItem } from "@/components/EvidenceBundleEditor";

// Structurally valid demonstration data for exercising the complete lifecycle.
// The public sources provide general context; they do not prove the fictional
// case-specific allegations, so an independent validator may return INCONCLUSIVE.
export interface DisputeExample {
  category: string;
  claim: string;
  policyReference: string;
  claimantItems: EvidenceItem[];
  respondentItems: EvidenceItem[];
}

export const DISPUTE_EXAMPLES: DisputeExample[] = [
  {
    category: "CONTENT_LISTING_MISMATCH",
    claim:
      "The platform removed my product listing for a handmade wool blanket, citing its counterfeit-goods policy, " +
      "but the listing description and photos describe a genuine handmade item with no brand names or trademarked logos.",
    policyReference: "https://en.wikipedia.org/wiki/Counterfeit_consumer_goods",
    claimantItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Blanket",
        description: "General background on blanket construction and materials; it does not independently verify the fictional listing or removal event.",
      },
    ],
    respondentItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Counterfeit_consumer_goods",
        description: "Reference page on counterfeit consumer goods, cited as the general policy basis for removing listings suspected of trademark misuse.",
      },
    ],
  },
  {
    category: "MODERATION_POLICY_VIOLATION",
    claim:
      "My account was suspended for allegedly violating the platform's harassment policy, but the flagged post was a " +
      "factual, non-abusive product review and did not target any individual by name or make personal attacks.",
    policyReference: "https://en.wikipedia.org/wiki/Terms_of_service",
    claimantItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Consumer_review",
        description: "General background on consumer reviews; it does not independently contain or verify the fictional flagged post.",
      },
    ],
    respondentItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Terms_of_service",
        description: "Reference page on platform terms of service, cited as the general basis for the harassment policy provision that was allegedly violated.",
      },
    ],
  },
  {
    category: "FACTUAL_ACCOUNT_DISPUTE",
    claim:
      "The counterparty claims the delivered goods arrived damaged and demands a refund, but the shipment was " +
      "packed and insured according to standard courier packaging requirements and no damage was reported at pickup.",
    policyReference: "https://en.wikipedia.org/wiki/Bill_of_lading",
    claimantItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Packaging_and_labeling",
        description: "General background on packaging practices; it does not independently verify how the fictional shipment was packed or delivered.",
      },
    ],
    respondentItems: [
      {
        kind: "WEB_PAGE",
        location: "https://en.wikipedia.org/wiki/Bill_of_lading",
        description: "Reference page on bills of lading, cited as the general shipping-documentation basis for the damage claim.",
      },
    ],
  },
];

export function pickExample(seed = 0): DisputeExample {
  return DISPUTE_EXAMPLES[seed % DISPUTE_EXAMPLES.length];
}
