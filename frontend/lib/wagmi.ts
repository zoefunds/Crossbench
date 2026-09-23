import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage } from "wagmi";
import { studionet as genlayerStudionet } from "genlayer-js/chains";

// Use genlayer-js's own studionet chain object, not a hand-rolled one.
// A plain viem `defineChain` with just id/name/rpcUrls/nativeCurrency looks
// fine to wagmi/AppKit but is missing GenLayer-specific fields genlayer-js
// reads internally when encoding a write (`consensusMainContract`,
// `defaultConsensusMaxRotations`, `defaultNumberOfInitialValidators`, ...).
// Without those, `consensusMaxRotations` resolved to `client.chain
// .defaultConsensusMaxRotations` -> undefined -> a real "Cannot convert
// undefined to a BigInt" crash on every real wallet write. Confirmed by
// reading genlayer-js's own chain definition
// (node_modules/genlayer-js/dist/chunk-*.js) - it's still built with
// viem's `defineChain`, so it's a valid wagmi/viem Chain too.
export const studionet = genlayerStudionet;

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: reownProjectId,
  networks: [studionet],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
