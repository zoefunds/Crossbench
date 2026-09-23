import { createClient } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import { useAccount } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { studionet } from "./wagmi";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as Address;
export const isContractConfigured = CONTRACT_ADDRESS.length > 0;

// Real value-transfer path: every write goes through the user's own
// connected wallet's EIP-1193 provider, signed client-side. This client is
// never used server-side and never holds a key that can move GEN - the
// backend's read-only client (backend/src/lib/genlayer-client.ts) is a
// separate, deliberately key-less instance.
//
// `connector.getProvider()` (wagmi's own documented way to get the raw
// EIP-1193 provider behind a connected wallet - MetaMask's injected
// `window.ethereum`, WalletConnect's provider, etc.) is required here, not
// `useConnectorClient().transport`: a viem Client's transport is a
// different, wrapped interface and is not wire-compatible with the raw
// `request({method, params})` -> JSON-RPC-shaped-response contract
// genlayer-js's EthereumProvider expects. Using the transport directly
// caused "Cannot convert undefined to a BigInt" - a genuine live-wallet
// bug, not a hypothetical - confirmed via a real MetaMask transaction that
// reached the GenLayer consensus contract (visible in MetaMask's Activity
// tab) but then failed client-side when genlayer-js tried to parse a
// response field that came back shaped differently than it expected.
export function useGenLayerClient() {
  const { address, connector, isConnected } = useAccount();
  const [provider, setProvider] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    if (!connector) {
      setProvider(null);
      return;
    }
    connector.getProvider().then((p) => {
      if (!cancelled) setProvider(p);
    });
    return () => {
      cancelled = true;
    };
  }, [connector]);

  return useMemo(() => {
    if (!isConnected || !address || !provider) return null;
    return createClient({
      chain: studionet,
      account: address as Address,
      provider: provider as never,
    });
  }, [isConnected, address, provider]);
}
