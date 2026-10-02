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
    const result = await siweMessage.verify({ signature });
    if (!result.success) return c.json({ error: "signature verification failed" }, 401);
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

  const accessToken = jwt.sign({ sub: address }, c.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });

  setCookie(c, "refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });

  return c.json({ accessToken, address });
});

authRoutes.post("/auth/logout", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");
  if (refreshToken) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(await sha256Hex(refreshToken)).run();
  }
  deleteCookie(c, "refresh_token", { path: "/auth" });
  return c.json({ ok: true });
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
