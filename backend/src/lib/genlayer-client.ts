import { createClient, createAccount } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import type { Env } from "./env.js";
import { isContractConfigured } from "./env.js";

// genlayer-js's `createClient` routes `eth_`-prefixed RPC calls (including
// the read-only `eth_call` behind `readContract`) through a
// `window.ethereum` branch whenever no `account` object is attached
// (`isAddress = typeof config.account !== "object"`). `window` does not
// exist in the Workers runtime, so that branch resolves to `undefined` and
// `readContract` crashes decoding it as hex. Attaching an `account` via
// `createAccount()` forces every request through the real fetch-based
// JSON-RPC path instead. This backend never writes to the contract, so the
// ephemeral account this creates is never used to sign or authorize
// anything real.
function client(env: Env) {
  const studionet = {
    id: Number(env.GENLAYER_CHAIN_ID ?? 61999),
    name: "GenLayer StudioNet",
    rpcUrls: { default: { http: [env.GENLAYER_RPC_URL] } },
    nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
    testnet: true,
  } as const;
  return createClient({ chain: studionet, account: createAccount() });
}

// genlayer-js decodes contract dict returns as JS `Map`, not a plain
// object - `JSON.stringify`/Hono's `c.json()` silently serializes a Map as
// `{}` (it has no own enumerable properties), which is how this shipped
// broken initially: no error anywhere, just an empty response. Recursively
// converts Maps (and nested Maps inside arrays/objects) to plain objects
// before anything is handed to `c.json()`.
function toPlain(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries(), ([k, v]) => [k, toPlain(v)]));
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

export async function readContract<T = unknown>(
  env: Env,
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  if (!isContractConfigured(env)) {
    throw new Error("CONTRACT_ADDRESS is not configured yet - deploy the Intelligent Contract and set it as a secret.");
  }
  const result = await client(env).readContract({
    address: env.CONTRACT_ADDRESS as Address,
    functionName,
    args: args as never,
  });
  return toPlain(result) as T;
}
