export interface Env {
  DB: D1Database;
  NONCES: KVNamespace;
  GENLAYER_NETWORK: string;
  GENLAYER_RPC_URL: string;
  CONTRACT_ADDRESS?: string;
  GENLAYER_CHAIN_ID?: string;
}

export function isContractConfigured(env: Env): boolean {
  return typeof env.CONTRACT_ADDRESS === "string" && env.CONTRACT_ADDRESS.length > 0;
}
