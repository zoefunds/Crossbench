const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://crossbench-api.fly.dev";

export interface DisputeSummary {
  id: string;
  claim: string;
  claim_category: string;
  claimant: string;
  respondent: string | null;
  status: string;
  stake_wei: string;
  winner: string | null;
  created_at: string;
}

export async function fetchDisputes(params: { offset?: number; limit?: number; status?: string } = {}): Promise<{ items: DisputeSummary[] }> {
  const url = new URL(`${API_URL}/disputes`);
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.status) url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load disputes (${res.status})`);
  return res.json();
}

export async function fetchDispute(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/disputes/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`dispute not found (${res.status})`);
  return res.json();
}
