import Link from "next/link";
import { Logo } from "./Logo";
import { WalletConnectButton } from "./WalletConnectButton";

const LINKS = [
  { href: "/disputes", label: "Disputes" },
  { href: "/disputes/new", label: "Open a Dispute" },
  { href: "/profile", label: "Profile" },
];

export function NavBar() {
  return (
    <header className="border-b border-border-ec">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Logo size={30} />
        </Link>
        <nav className="hidden gap-6 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-text-dim transition hover:text-text-ec">
              {link.label}
            </Link>
          ))}
        </nav>
        <WalletConnectButton />
      </div>
    </header>
  );
}
