"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const STORAGE_KEY = "crossbench-access-token";

export function useSiweSession() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    setAccessToken(sessionStorage.getItem(STORAGE_KEY));
  }, []);

  const signIn = useCallback(async () => {
    if (!address || !chainId) return;
    setSigningIn(true);
    try {
      const { nonce } = await fetch(`${API_URL}/auth/nonce`, { credentials: "include" }).then((r) => r.json());
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Crossbench. This request will not trigger a blockchain transaction or cost any gas.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      }).prepareMessage();
      const signature = await signMessageAsync({ message });
      const res = await fetch(`${API_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) throw new Error("sign-in failed");
      const { accessToken: token } = await res.json();
      sessionStorage.setItem(STORAGE_KEY, token);
      setAccessToken(token);
    } finally {
      setSigningIn(false);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    sessionStorage.removeItem(STORAGE_KEY);
    setAccessToken(null);
  }, []);

  return { accessToken, signIn, signOut, signingIn };
}
