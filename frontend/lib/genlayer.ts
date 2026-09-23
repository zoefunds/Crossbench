import { createClient } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import { useAccount, useConnectorClient } from "wagmi";
import { useMemo } from "react";
import { studionet } from "./wagmi";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as Address;
export const isContractConfigured = CONTRACT_ADDRESS.length > 0;

// Real value-transfer path: every write goes through the user's own
// connected wallet's EIP-1193 provider, signed client-side. This client is
// never used server-side and never holds a key that can move GEN - the
// backend's read-only client (backend/src/lib/genlayer-client.ts) is a
// separate, deliberately key-less instance.
export function useGenLayerClient() {
  const { address, connector } = useAccount();
  const { data: connectorClient } = useConnectorClient();

  return useMemo(() => {
    if (!address || !connector) return null;
    const provider = connectorClient?.transport as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;
    if (!provider) return null;
    return createClient({
      chain: studionet,
      account: address as Address,
      provider: provider as never,
    });
  }, [address, connector, connectorClient]);
}
