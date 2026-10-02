"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useSiweSession } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://crossbench-api.fly.dev";

interface Connection {
  provider: string;
  provider_handle: string | null;
  connected_at: string;
}

export default function SettingsPage() {
  const { isConnected } = useAccount();
  const { accessToken, signIn, signOut, signingIn } = useSiweSession();
  const [connections, setConnections] = useState<Connection[]>([]);

  const loadConnections = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_URL}/social/connections`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setConnections((await res.json()).items);
  }, [accessToken]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function disconnect(provider: string) {
    await fetch(`${API_URL}/social/connections/${provider}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    loadConnections();
  }

  if (!isConnected) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-text-dim">Connect your wallet first.</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-headline text-3xl font-bold text-text-ec">Settings</h1>

      <div className="mt-8 glass-card p-5">
        <p className="mb-1 font-semibold text-text-ec">Session</p>
        {accessToken ? (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-success">Signed in with SIWE</p>
            <button onClick={signOut} className="text-sm text-error hover:underline">
              Sign out
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <p className="mb-3 text-sm text-text-dim">
              Connecting a wallet alone does not authenticate you. Sign a message (no gas, no transaction) to
              establish a session.
            </p>
            <button onClick={signIn} disabled={signingIn} className="rounded px-5 py-2.5 font-semibold text-navy bg-cyan disabled:opacity-40">
              {signingIn ? "Signing..." : "Sign in with Ethereum"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 glass-card p-5">
        <p className="mb-1 font-semibold text-text-ec">Social connections</p>
        <p className="mb-4 text-sm text-text-dim">
          Linked through OAuth, never by typing a username - this prevents anyone from claiming an account that
          isn&apos;t theirs.
        </p>
        {!accessToken && <p className="text-sm text-text-dim">Sign in above to manage connections.</p>}
        {accessToken && connections.length === 0 && <p className="text-sm text-text-dim">No connections linked yet.</p>}
        <div className="space-y-2">
          {connections.map((c) => (
            <div key={c.provider} className="flex items-center justify-between rounded border border-border-ec px-3 py-2">
              <span className="text-sm text-text-ec">{c.provider}: {c.provider_handle ?? "connected"}</span>
              <button onClick={() => disconnect(c.provider)} className="text-sm text-error hover:underline">
                Disconnect
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
