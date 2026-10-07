import type { EvidenceItem } from "@/components/EvidenceBundleEditor";

// Valid non-zero demo addresses. Autofill always chooses one other than the
// connected claimant, satisfying the contract's party-binding invariant.
const DEMO_RESPONDENTS = [
  "0x94D2637d397f7277b4d9d21796bbAFe08F9De416",
  "0xF526ADbdEB5169e7CeA32c06EF69d7ce4a2D6276",
] as const;

export function demoRespondentFor(claimant?: string): string {
  return DEMO_RESPONDENTS.find((candidate) => candidate.toLowerCase() !== claimant?.toLowerCase()) ?? DEMO_RESPONDENTS[0];
}

export function isValidIntendedRespondent(respondent: string, claimant?: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(respondent.trim()) && respondent.trim().toLowerCase() !== claimant?.toLowerCase();
}

export interface DisputeExample {
  category: string;
  claim: string;
  policyReference: string;
  policyIssuer: string;
  claimantItems: EvidenceItem[];
  respondentItems: EvidenceItem[];
  claimantChallengeItems: EvidenceItem[];
  respondentChallengeItems: EvidenceItem[];
}

// Contract-complete examples for every category. Policy links are first-party
// documents from the named issuer. Challenge sources are distinct from all
// pinned sources because duplicate evidence is rejected across a dispute.
export const DISPUTE_EXAMPLES: DisputeExample[] = [
  {
    category: "CONTENT_LISTING_MISMATCH",
    claim: "DEMO CASE: GitHub rejected a fictional Marketplace app listing as misleading even though its fictional description accurately identified every paid feature, integration requirement, and pricing-plan limitation.",
    policyReference: "https://docs.github.com/en/site-policy/github-terms/github-marketplace-developer-agreement",
    policyIssuer: "GitHub",
    claimantItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace", description: "GitHub's first-party Marketplace listing guide provides authoritative context for drafting, reviewing, and publishing an app listing." }],
    respondentItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app", description: "GitHub's first-party listing-description guidance states the official requirements for accurate app descriptions, images, and links." }],
    claimantChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/drafting-a-listing-for-your-app", description: "GitHub's first-party drafting guide supplies additional authoritative context for creating and completing Marketplace listings." }],
    respondentChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/submitting-your-listing-for-publication", description: "GitHub's first-party publication guide supplies distinct official context for review and approval of completed Marketplace listings." }],
  },
  {
    category: "MODERATION_POLICY_VIOLATION",
    claim: "DEMO CASE: GitHub suspended a fictional account for harassment after a fictional issue comment criticized a software release without naming, threatening, or repeatedly targeting another person.",
    policyReference: "https://docs.github.com/en/site-policy/acceptable-use-policies/github-bullying-and-harassment",
    policyIssuer: "GitHub",
    claimantItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/site-policy/github-terms/github-community-guidelines", description: "GitHub's first-party Community Guidelines provide official context for productive participation and prohibited interpersonal behavior." }],
    respondentItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies", description: "GitHub's first-party acceptable-use overview supplies the official policy family applied to content and account enforcement." }],
    claimantChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service", description: "GitHub's first-party Terms of Service provide additional authoritative context governing account access and user content." }],
    respondentChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement", description: "GitHub's first-party appeal and reinstatement policy provides distinct official context for review of moderation decisions." }],
  },
  {
    category: "MODERATION_WRONGFUL_ACTION",
    claim: "DEMO CASE: npm removed a fictional package for alleged abusive content even though its fictional README contained technical migration instructions and no threats, harassment, or discriminatory language.",
    policyReference: "https://docs.npmjs.com/policies/open-source-terms/",
    policyIssuer: "npm, Inc.",
    claimantItems: [{ kind: "WEB_PAGE", location: "https://docs.npmjs.com/policies/conduct/", description: "npm's first-party Code of Conduct supplies the official behavioral rules relevant to the fictional content-removal decision." }],
    respondentItems: [{ kind: "WEB_PAGE", location: "https://docs.npmjs.com/policies/terms/", description: "npm's first-party terms index identifies the official terms and policies that govern public-registry use." }],
    claimantChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.npmjs.com/policies/disputes/", description: "npm's first-party disputes policy provides separate authoritative context for contested registry names and enforcement." }],
    respondentChallengeItems: [{ kind: "WEB_PAGE", location: "https://docs.npmjs.com/policies/unpublish/", description: "npm's first-party unpublish policy provides distinct official context for package removal and restoration rules." }],
  },
  {
    category: "FACTUAL_ACCOUNT_DISPUTE",
    claim: "DEMO CASE: One party says Ethereum mainnet genesis block 0 has hash 0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3, while the other says that hash identifies a later block.",
    policyReference: "https://ethereum.org/en/developers/docs/blocks/",
    policyIssuer: "Ethereum Foundation",
    claimantItems: [{ kind: "WEB_PAGE", location: "https://ethereum.org/en/history/", description: "Ethereum.org's first-party history page provides authoritative context for the launch and early history of Ethereum mainnet." }],
    respondentItems: [{ kind: "ONCHAIN_REF", location: "https://eth.blockscout.com/api/v2/blocks/0", description: "Blockscout's public Ethereum mainnet API exposes immutable ledger data for genesis block 0, including its full block hash.", chain_id: "eip155:1", reference_type: "BLOCK", reference_value: "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3" }],
    claimantChallengeItems: [{ kind: "WEB_PAGE", location: "https://ethereum.org/en/developers/docs/intro-to-ethereum/", description: "Ethereum.org's first-party technical introduction provides distinct context on canonical block history and network consensus." }],
    respondentChallengeItems: [{ kind: "WEB_PAGE", location: "https://ethereum.org/en/developers/docs/data-and-analytics/block-explorers/", description: "Ethereum.org's first-party block-explorer documentation explains how independently fetched block data can be inspected and verified." }],
  },
];

export function pickExample(seed = 0): DisputeExample {
  return DISPUTE_EXAMPLES[seed % DISPUTE_EXAMPLES.length];
}
