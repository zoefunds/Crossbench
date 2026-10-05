import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeConfig } from "../src/lib/env.js";

function valid(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgres://db/test",
    JWT_SECRET: "j".repeat(32),
    INTERNAL_SECRET: "i".repeat(24),
    CONTRACT_ADDRESS: `0x${"1".repeat(40)}`,
    GENLAYER_RPC_URL: "https://rpc.example",
    GENLAYER_CHAIN_ID: "61999",
    APP_ORIGIN: "https://crossbench-app.vercel.app",
  };
}

test("runtime configuration accepts the canonical production shape", () => {
  assert.doesNotThrow(() => validateRuntimeConfig(valid()));
});

test("runtime configuration fails closed on a missing secret", () => {
  const env = valid();
  delete env.JWT_SECRET;
  assert.throws(() => validateRuntimeConfig(env), /JWT_SECRET/);
});

test("runtime configuration rejects insecure origins and malformed addresses", () => {
  assert.throws(() => validateRuntimeConfig({ ...valid(), APP_ORIGIN: "http://crossbench-app.vercel.app" }), /HTTPS/);
  assert.throws(() => validateRuntimeConfig({ ...valid(), CONTRACT_ADDRESS: "0x1234" }), /20-byte/);
});
