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
  APP_ORIGIN: string;
}

export function isContractConfigured(env: Env): boolean {
  return typeof env.CONTRACT_ADDRESS === "string" && env.CONTRACT_ADDRESS.length > 0;
}

export function validateRuntimeConfig(source: NodeJS.ProcessEnv): void {
  const required = ["DATABASE_URL", "JWT_SECRET", "INTERNAL_SECRET", "CONTRACT_ADDRESS", "GENLAYER_RPC_URL", "GENLAYER_CHAIN_ID", "APP_ORIGIN"] as const;
  const missing = required.filter((name) => !source[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(source.CONTRACT_ADDRESS!)) throw new Error("CONTRACT_ADDRESS must be a 20-byte hex address");
  if (source.JWT_SECRET!.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  if (source.INTERNAL_SECRET!.length < 24) throw new Error("INTERNAL_SECRET must be at least 24 characters");
  if (!Number.isInteger(Number(source.GENLAYER_CHAIN_ID))) throw new Error("GENLAYER_CHAIN_ID must be an integer");
  for (const name of ["GENLAYER_RPC_URL", "APP_ORIGIN"] as const) {
    const url = new URL(source[name]!);
    if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  }
}
