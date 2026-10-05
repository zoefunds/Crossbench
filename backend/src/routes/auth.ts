import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import type { Env } from "../lib/env.js";

// Wallet-connected alone is never authentication. This SIWE flow is the
// actual authentication boundary: a nonce is minted server-side, the
// wallet signs a structured message binding that exact nonce + origin +
// address, and only a verified signature over it establishes a session.
const NONCE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const authRoutes = new Hono<{ Bindings: Env & { JWT_SECRET: string } }>();

function issueAccessToken(address: string, secret: string) {
  return jwt.sign({ sub: address }, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

function setRefreshCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, "refresh_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

authRoutes.get("/auth/nonce", async (c) => {
  const nonce = generateNonce();
  await c.env.NONCES.put(`siwe:${nonce}`, "1", { expirationTtl: NONCE_TTL_SECONDS });
  return c.json({ nonce });
});

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

authRoutes.post("/auth/verify", async (c) => {
  const parsed = verifySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
  const { message, signature } = parsed.data;

  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    return c.json({ error: "malformed SIWE message" }, 400);
  }

  const nonceKey = `siwe:${siweMessage.nonce}`;
  if (!(await c.env.NONCES.get(nonceKey))) {
    return c.json({ error: "unknown or expired nonce" }, 401);
  }

  try {
    const expectedOrigin = c.env.APP_ORIGIN;
    const expectedDomain = new URL(expectedOrigin).host;
    const result = await siweMessage.verify({
      signature,
      domain: expectedDomain,
      nonce: siweMessage.nonce,
      time: new Date().toISOString(),
    });
    if (!result.success) return c.json({ error: "signature verification failed" }, 401);
    if (siweMessage.uri !== expectedOrigin) return c.json({ error: "invalid SIWE origin" }, 401);
    if (Number(siweMessage.chainId) !== Number(c.env.GENLAYER_CHAIN_ID ?? 61999)) return c.json({ error: "invalid SIWE chain" }, 401);
    if (!siweMessage.issuedAt || Math.abs(Date.now() - new Date(siweMessage.issuedAt).getTime()) > 5 * 60 * 1000) return c.json({ error: "stale SIWE message" }, 401);
  } catch {
    return c.json({ error: "signature verification failed" }, 401);
  }

  await c.env.NONCES.delete(nonceKey);

  const address = siweMessage.address.toLowerCase();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO users (address, first_seen_at, last_login_at) VALUES (?, ?, ?)
     ON CONFLICT (address) DO UPDATE SET last_login_at = excluded.last_login_at`,
  ).bind(address, now, now).run();

  const refreshToken = crypto.randomUUID() + crypto.randomUUID();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await c.env.DB.prepare(`INSERT INTO sessions (token, address, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256Hex(refreshToken), address, now, refreshExpiresAt)
    .run();

  const accessToken = issueAccessToken(address, c.env.JWT_SECRET);
  setRefreshCookie(c, refreshToken);

  return c.json({ accessToken, address });
});

authRoutes.post("/auth/refresh", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");
  if (!refreshToken) return c.json({ error: "refresh session missing" }, 401);
  const tokenHash = await sha256Hex(refreshToken);
  const replacement = crypto.randomUUID() + crypto.randomUUID();
  const replacementHash = await sha256Hex(replacement);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  // Consume and replace in one PostgreSQL statement. The DELETE row lock
  // ensures a stolen/replayed refresh token cannot win two concurrent races.
  const session = await c.env.DB.prepare(
    `WITH consumed AS (
       DELETE FROM sessions WHERE token = ? AND expires_at > ? RETURNING address
     )
     INSERT INTO sessions (token, address, created_at, expires_at)
     SELECT ?, address, ?, ? FROM consumed
     RETURNING address`,
  ).bind(tokenHash, now, replacementHash, now, expiresAt).first<{ address: string }>();
  if (!session) {
    deleteCookie(c, "refresh_token", { path: "/auth", secure: true, sameSite: "None" });
    return c.json({ error: "refresh session expired" }, 401);
  }
  setRefreshCookie(c, replacement);
  return c.json({ accessToken: issueAccessToken(session.address, c.env.JWT_SECRET), address: session.address });
});

authRoutes.post("/auth/logout", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");
  if (refreshToken) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(await sha256Hex(refreshToken)).run();
  }
  deleteCookie(c, "refresh_token", { path: "/auth", secure: true, sameSite: "None" });
  return c.json({ ok: true });
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
