"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, studionet, reownProjectId } from "@/lib/wagmi";

if (reownProjectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks: [studionet],
    projectId: reownProjectId,
    metadata: {
      name: "Crossbench",
      description: "Both sides submit their proof. Neither side gets to weigh it.",
      url: process.env.NEXT_PUBLIC_APP_URL ?? "https://crossbench.app",
      icons: ["/icon.svg"],
    },
    features: { analytics: false, email: false, socials: [] },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#4cd7f6",
      "--w3m-color-mix": "#0a0e16",
      "--w3m-color-mix-strength": 30,
      "--w3m-border-radius-master": "2px",
      "--w3m-font-family": "var(--font-headline), ui-sans-serif, system-ui, sans-serif",
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
