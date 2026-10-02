import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { requireAuth } from "../middleware/auth.js";

// Social-account linking must go through an OAuth-style connection flow,
// never a free-text username field - a free-text field lets anyone claim
// someone else's account. This is the connection abstraction; concrete
// OAuth providers (client id/secret) are wired in per ARCHITECTURE.md's
// "launch narrow, generalize after" decision - `PROVIDERS` below is where
// each one gets registered once its app credentials exist as Worker
// environment secrets.
interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  // twitter: { authorizeUrl: "...", tokenUrl: "...", scope: "users.read" },
};

type Vars = { address: string };
export const socialRoutes = new Hono<{ Bindings: Env & { JWT_SECRET: string }; Variables: Vars }>();

socialRoutes.get("/social/connections", requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT provider, provider_handle, connected_at FROM social_connections WHERE address = ?`,
  ).bind(c.get("address")).all();
  return c.json({ items: results ?? [] });
});

socialRoutes.delete("/social/connections/:provider", requireAuth, async (c) => {
  await c.env.DB.prepare(`DELETE FROM social_connections WHERE address = ? AND provider = ?`)
    .bind(c.get("address"), c.req.param("provider"))
    .run();
  return c.json({ ok: true });
});

socialRoutes.get("/social/connect/:provider", requireAuth, async (c) => {
  const provider = c.req.param("provider");
  const config = provider ? PROVIDERS[provider] : undefined;
  if (!config) return c.json({ error: `provider '${provider}' is not configured yet` }, 501);
  const state = crypto.randomUUID();
  await c.env.NONCES.put(`oauth_state:${state}`, c.get("address"), { expirationTtl: 600 });
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  return c.json({ redirectUrl: url.toString() });
});

socialRoutes.get("/social/callback/:provider", async (c) => {
  const provider = c.req.param("provider");
  const state = c.req.query("state") ?? "";
  const address = await c.env.NONCES.get(`oauth_state:${state}`);
  if (!address) return c.json({ error: "invalid or expired OAuth state" }, 400);
  await c.env.NONCES.delete(`oauth_state:${state}`);

  // Token exchange + profile fetch happen here once a provider is
  // registered in PROVIDERS - deliberately not stubbed with fake data.
  return c.json({ error: `provider '${provider}' token exchange not yet implemented` }, 501);
});
