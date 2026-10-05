"use client";

import { useAccount } from "wagmi";
import { useSiweSession } from "@/lib/auth";

export default function SettingsPage() {
  const { isConnected } = useAccount();
  const { accessToken, signIn, signOut, signingIn } = useSiweSession();

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
    </div>
  );
}
