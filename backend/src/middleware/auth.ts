import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import type { Env } from "../lib/env.js";

type AuthEnv = { Bindings: Env & { JWT_SECRET: string }; Variables: { address: string } };

export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try { c.set("address", (jwt.verify(token, c.env.JWT_SECRET) as { sub: string }).sub); }
  catch { return c.json({ error: "unauthorized" }, 401); }
  await next();
}
