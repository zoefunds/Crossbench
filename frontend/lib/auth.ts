"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://crossbench-api.fly.dev";
const STORAGE_KEY = "crossbench-access-token";

export function accessTokenRefreshDelay(token: string, now = Date.now()): number | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const payload = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    const expiryMs = Number(payload.exp ?? 0) * 1000;
    if (!Number.isFinite(expiryMs) || expiryMs <= 0) return null;
    return Math.max(1_000, expiryMs - now - 60_000);
  } catch { return null; }
}

export function useSiweSession() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) {
      sessionStorage.removeItem(STORAGE_KEY);
      setAccessToken(null);
      return null;
    }
    const { accessToken: token } = await res.json();
    sessionStorage.setItem(STORAGE_KEY, token);
    setAccessToken(token);
    return token as string;
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setAccessToken(stored);
      void refresh();
    }, 0);
    return () => clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    if (!accessToken) return;
    const delay = accessTokenRefreshDelay(accessToken);
    if (delay === null) return;
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [accessToken, refresh]);

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

  return { accessToken, signIn, signOut, signingIn, refresh };
}
