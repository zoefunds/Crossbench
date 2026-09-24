"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

function truncate(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => open({ view: "Account" })}
        className="data-mono flex items-center gap-2 rounded border border-border-ec bg-card px-3 py-1.5 text-sm text-text-ec transition-colors hover:border-cyan hover:text-cyan"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
        {truncate(address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open()}
      className="rounded px-4 py-1.5 text-sm font-headline font-semibold text-navy bg-cyan transition hover:brightness-110"
    >
      Connect Wallet
    </button>
  );
}
