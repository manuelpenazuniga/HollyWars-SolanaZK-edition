import type { Metadata } from "next";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Holy Wars — The Eternal Scoreboard",
  description:
    "The eternal scoreboard for the holy wars of programming. Tabs vs Spaces. Vim vs Emacs. Dark vs Light.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <WalletContextProvider>
          <Header />
          <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
          <footer className="border-t border-cream/10 mt-16 py-6 text-center">
            <p className="font-mono text-xs text-cream/30 tracking-wider">
              ⚔ HOLY WARS — SOLANA DEV CHALLENGE 2026 ⚔
            </p>
            <p className="font-mono text-[10px] text-cream/20 mt-1">
              YOUR CODEBASE NEEDS YOU · VOTE ANONYMOUSLY · FIGHT FOREVER
            </p>
          </footer>
        </WalletContextProvider>
      </body>
    </html>
  );
}
