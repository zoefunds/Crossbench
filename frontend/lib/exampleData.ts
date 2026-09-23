import type { EvidenceItem } from "@/components/EvidenceBundleEditor";

// Real, complete example data for one-click testing - genuine public URLs
// and realistic claim text, not lorem-ipsum. Picked so a tester can open a
// dispute, accept it as a second wallet, submit evidence, and trigger
// evaluation end to end without inventing content by hand.
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
        description: "Reference page describing generic blanket construction and materials, matching the listing's description of a plain handmade wool blanket.",
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
        description: "Reference page on consumer reviews, showing the flagged content matches the normal format and tone of a standard product review.",
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
        description: "Reference page on standard packaging and labeling practices, supporting that the shipment followed conventional protective packaging norms.",
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
