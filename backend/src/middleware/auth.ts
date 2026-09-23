import type { Context, Next } from "hono";
import jwt from "@tsndr/cloudflare-worker-jwt";
import type { Env } from "../lib/env.js";

type AuthEnv = { Bindings: Env & { JWT_SECRET: string }; Variables: { address: string } };

export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !(await jwt.verify(token, c.env.JWT_SECRET))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const { payload } = jwt.decode(token);
  c.set("address", (payload as { sub: string }).sub);
  await next();
}
