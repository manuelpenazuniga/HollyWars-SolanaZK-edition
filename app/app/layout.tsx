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
          <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
            {children}
          </main>
          <footer className="border-t border-panel-edge mt-16 py-8 text-center space-y-1.5">
            <p className="hud-label">
              Holy Wars — Solana Dev Challenge 2026
            </p>
            <p className="font-mono text-[11px] text-bone/25">
              your codebase needs you · vote anonymously · fight forever
            </p>
          </footer>
        </WalletContextProvider>
      </body>
    </html>
  );
}
