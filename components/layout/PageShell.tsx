import React from "react";
import Link from "next/link";
import ConnectButton from "../ui/ConnectButton";
import BuiltOnBotChain from "../botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";

export interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  activeTab?: "markets" | "new" | "me";
}

export function PageShell({
  children,
  title,
  subtitle,
  badge,
  action,
  activeTab = "markets",
}: PageShellProps) {
  const { site, explorer } = footerLinks();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      {/* Odds Board Top Masthead */}
      <header className="border-b-4 border-[var(--border-strong)] bg-[#04141F] text-white px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="w-8 h-8 bg-[var(--accent)] text-[var(--accent-ink)] font-black text-sm flex items-center justify-center border-2 border-white shadow-xs">
                TB
              </span>
              <span className="font-black text-xl tracking-tight text-white uppercase">
                Tote Pool
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1 font-mono text-xs font-bold uppercase">
              <Link
                href="/"
                className={`px-3 py-1.5 transition-colors ${
                  activeTab === "markets"
                    ? "bg-[var(--accent)] text-[#04141F]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                [01] Pools
              </Link>
              <Link
                href="/new"
                className={`px-3 py-1.5 transition-colors ${
                  activeTab === "new"
                    ? "bg-[var(--accent)] text-[#04141F]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                [02] Open Pool
              </Link>
              <Link
                href="/me"
                className={`px-3 py-1.5 transition-colors ${
                  activeTab === "me"
                    ? "bg-[var(--accent)] text-[#04141F]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                [03] Settlement
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Racetrack Header Strip */}
      {(title || subtitle || action) && (
        <div className="bg-[var(--bg-surface)] border-b-2 border-[var(--border-strong)] px-4 py-5 sm:px-6 shadow-sm">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                {title && <h1 className="text-2xl font-black uppercase tracking-tight">{title}</h1>}
                {badge}
              </div>
              {subtitle && <p className="text-xs font-medium text-[var(--text-muted)] mt-1">{subtitle}</p>}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
          </div>
        </div>
      )}

      {/* Main Board View */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:px-6">{children}</main>

      {/* Shared UI Contract Footer: exactly 3 links */}
      <footer className="border-t-4 border-[var(--border-strong)] bg-[#04141F] text-white/70 text-xs px-4 py-4 sm:px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BuiltOnBotChain />
          </div>
          <div className="flex items-center gap-6 font-mono text-xs uppercase">
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--accent)]"
            >
              botchain.ai
            </a>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--accent)]"
            >
              BOT Chain Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PageShell;
