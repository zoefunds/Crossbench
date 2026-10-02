import { Database, ExpiringStore } from "./db.js";
export interface Env {
  DB: Database;
  NONCES: ExpiringStore;
  GENLAYER_NETWORK: string;
  GENLAYER_RPC_URL: string;
  CONTRACT_ADDRESS?: string;
  GENLAYER_CHAIN_ID?: string;
  GENLAYER_RPC_MAX_REQUESTS_PER_DAY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  JWT_SECRET: string;
  INTERNAL_SECRET?: string;
}

export function isContractConfigured(env: Env): boolean {
  return typeof env.CONTRACT_ADDRESS === "string" && env.CONTRACT_ADDRESS.length > 0;
}
