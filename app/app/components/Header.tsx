"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const NAV_ITEMS = [
  { href: "/", label: "WAR ROOM" },
  { href: "/enlist", label: "ENLIST" },
  { href: "/medals", label: "MEDALS" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-cream/20 bg-war-black/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="text-3xl">⚔</span>
          <div>
            <h1 className="font-stencil text-xl tracking-wider text-cream group-hover:text-war-red transition-colors">
              HOLY WARS
            </h1>
            <p className="text-[10px] font-mono text-cream/50 tracking-widest uppercase">
              The Eternal Scoreboard
            </p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 font-stencil text-sm tracking-wider transition-all duration-200 border-2 ${
                pathname === item.href
                  ? "border-war-red text-war-red bg-war-red/10"
                  : "border-transparent text-cream/70 hover:text-cream hover:border-cream/30"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <WalletMultiButton
              style={{
                backgroundColor: "transparent",
                border: "2px solid rgba(245, 240, 225, 0.3)",
                color: "#F5F0E1",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: "12px",
                letterSpacing: "0.05em",
              }}
            />
          </div>
        </div>
      </div>

      <nav className="md:hidden flex border-t border-cream/10">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 text-center py-2 font-stencil text-xs tracking-wider transition-colors ${
              pathname === item.href
                ? "text-war-red bg-war-red/10"
                : "text-cream/60"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
