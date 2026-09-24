import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavBar } from "@/components/NavBar";

const hankenGrotesk = Hanken_Grotesk({ variable: "--font-headline", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono-data", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Crossbench",
  description: "Both sides submit their proof. Neither side gets to weigh it. Stake-backed dispute resolution decided by independent GenLayer validator consensus.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-navy text-text-ec">
        <Providers>
          <NavBar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
