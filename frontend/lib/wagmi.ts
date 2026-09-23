import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage } from "wagmi";
import { defineChain } from "viem";

// GenLayer StudioNet - id/rpc must match the value the deployed contract
// actually lives on. NEXT_PUBLIC_GENLAYER_CHAIN_ID / _RPC_URL are set once
// the contract address is configured (see CONTRACT_DEPLOYMENT.md).
export const studionet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID ?? 61999),
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api"] },
  },
  testnet: true,
});

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: reownProjectId,
  networks: [studionet],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
