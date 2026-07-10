"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const NAV_ITEMS = [
  { href: "/", label: "War Room" },
  { href: "/enlist", label: "Enlist" },
  { href: "/medals", label: "Medals" },
];

function NavLink({
  href,
  label,
  active,
  className = "",
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative px-4 py-2 font-sans text-sm transition-colors ${
        active ? "text-bone" : "text-bone/50 hover:text-bone"
      } ${className}`}
    >
      {label}
      {active && (
        <span
          className="absolute left-4 right-4 -bottom-px h-0.5 bg-arcane"
          aria-hidden
        />
      )}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-void/95 backdrop-blur-sm border-b border-panel-edge">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="group shrink-0">
          <span className="font-pixel text-base md:text-lg text-bone group-hover:text-arcane transition-colors">
            HOLY WARS
          </span>
          <span className="hidden lg:block hud-label mt-0.5">
            The Eternal Scoreboard
          </span>
        </Link>

        <nav className="hidden md:flex items-center">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={pathname === item.href}
            />
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 border border-panel-edge">
            <span className="w-1.5 h-1.5 bg-gold" aria-hidden />
            <span className="hud-label">Devnet</span>
          </span>
          <WalletMultiButton
            style={{
              backgroundColor: "transparent",
              border: "1px solid #1E232E",
              borderRadius: 0,
              color: "#E8E4D8",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: "12px",
              height: "36px",
              lineHeight: "36px",
            }}
          />
        </div>
      </div>

      <nav className="md:hidden flex border-t border-panel-edge">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={pathname === item.href}
            className="flex-1 text-center"
          />
        ))}
      </nav>
    </header>
  );
}
