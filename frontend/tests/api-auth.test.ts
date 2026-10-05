import assert from "node:assert/strict";
import test from "node:test";
import { fetchDispute, fetchDisputes } from "../lib/api.js";
import { accessTokenRefreshDelay } from "../lib/auth.js";
import { formatRemaining, remainingSeconds } from "../components/DeadlineCountdown.js";

test("forced detail and list refreshes add fresh=1 and disable fetch caching", async () => {
  const calls: Array<{ url: string; cache?: RequestCache }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), cache: init?.cache });
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await fetchDisputes({ fresh: true });
    await fetchDispute("ec-9", { fresh: true });
  } finally { globalThis.fetch = original; }
  assert.equal(new URL(calls[0].url).searchParams.get("fresh"), "1");
  assert.equal(new URL(calls[1].url).searchParams.get("fresh"), "1");
  assert.deepEqual(calls.map((call) => call.cache), ["no-store", "no-store"]);
});

test("access token refresh is scheduled one minute before expiry", () => {
  const now = 1_000_000;
  const payload = Buffer.from(JSON.stringify({ exp: (now + 300_000) / 1000 })).toString("base64url");
  assert.equal(accessTokenRefreshDelay(`x.${payload}.y`, now), 240_000);
  assert.equal(accessTokenRefreshDelay("malformed", now), null);
});

test("deadline countdown formats every active window down to seconds", () => {
  assert.equal(formatRemaining(172801), "2d 0h 0m 1s");
  assert.equal(formatRemaining(3661), "1h 1m 1s");
  assert.equal(formatRemaining(59), "0m 59s");
  assert.equal(remainingSeconds("100", 99_001), 1);
  assert.equal(remainingSeconds("100", 100_000), 0);
  assert.equal(remainingSeconds("100", 101_000), 0);
});
