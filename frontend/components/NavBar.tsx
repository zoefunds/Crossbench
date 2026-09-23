"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { WalletConnectButton } from "./WalletConnectButton";

const LINKS = [
  { href: "/disputes", label: "Disputes" },
  { href: "/disputes/new", label: "Open a Dispute" },
  { href: "/profile", label: "Profile" },
];

export function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-border-ec">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" onClick={() => setMobileOpen(false)}>
          <Logo size={30} />
        </Link>
        <nav className="hidden gap-6 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-text-dim transition hover:text-text-ec">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <WalletConnectButton />
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded border border-border-ec text-text-ec md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              {mobileOpen ? (
                <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M2 4H16M2 9H16M2 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-border-ec px-6 py-4 md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded px-2 py-2.5 text-sm text-text-dim transition hover:bg-navy-elevated hover:text-text-ec"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
