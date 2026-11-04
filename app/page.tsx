"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import { TOTE_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { MarketInfo, MarketState, phase, shares } from "@/lib/tote";

export default function ToteHomePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [marketTotals, setMarketTotals] = useState<Record<string, bigint[]>>({});
  const [nowSecs, setNowSecs] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMarkets() {
      if (!publicClient || !contractAddress) {
        setLoading(false);
        return;
      }

      try {
        const block = await publicClient.getBlock();
        if (!cancelled) setNowSecs(block.timestamp);

        const totalMarkets = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "marketCount",
        })) as bigint;

        if (totalMarkets === 0n) {
          if (!cancelled) {
            setMarkets([]);
            setLoading(false);
          }
          return;
        }

        const countToFetch = totalMarkets > 50n ? 50n : totalMarkets;
        const res = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "latest",
          args: [0n, countToFetch],
        })) as [readonly bigint[], readonly any[], bigint];

        const [ids, mData] = res;
        const list: MarketInfo[] = [];
        const totalsMap: Record<string, bigint[]> = {};

        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const raw = mData[i];

          const opts = (await publicClient.readContract({
            address: contractAddress,
            abi: TOTE_ABI,
            functionName: "optionsOf",
            args: [id],
          })) as string[];

          const tots = (await publicClient.readContract({
            address: contractAddress,
            abi: TOTE_ABI,
            functionName: "totals",
            args: [id],
          })) as readonly bigint[];

          totalsMap[id.toString()] = [...tots];

          list.push({
            id,
            creator: raw.creator,
            judge: raw.judge,
            closesAt: BigInt(raw.closesAt),
            decideBy: BigInt(raw.decideBy),
            judgeBps: Number(raw.judgeBps),
            optionCount: Number(raw.optionCount),
            winner: Number(raw.winner),
            state: Number(raw.state) as MarketState,
            total: BigInt(raw.total),
            credited: BigInt(raw.credited),
            paidOut: BigInt(raw.paidOut),
            claimedStake: BigInt(raw.claimedStake),
            question: raw.question,
            options: opts,
          });
        }

        if (!cancelled) {
          setMarkets(list);
          setMarketTotals(totalsMap);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load tote markets:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadMarkets();
    const interval = setInterval(loadMarkets, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress]);

  // Order §3.2: open markets (closing soonest first), then waiting for the judge, then settled
  const sortedMarkets = [...markets].sort((a, b) => {
    const phA = phase(a, nowSecs);
    const phB = phase(b, nowSecs);

    const rank = (p: string) => {
      if (p === "closing_soon" || p === "open") return 1;
      if (p === "closed_waiting_judge" || p === "expired_silent") return 2;
      return 3; // decided or void
    };

    if (rank(phA) !== rank(phB)) {
      return rank(phA) - rank(phB);
    }
    // If both open, closing soonest first
    if (rank(phA) === 1) {
      return Number(a.closesAt - b.closesAt);
    }
    return Number(b.id - a.id);
  });

  return (
    <PageShell
      title="Parimutuel Odds Boards"
      subtitle="Back an outcome. The winners split the entire pot in proportion to their stake."
      activeTab="markets"
      action={
        <Link href="/new">
          <Button variant="primary" size="md">
            + Open a Pool
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Notice of limits from Spec §1 & §3.4 */}
        <section aria-labelledby="limits-heading" className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 shadow-[3px_3px_0px_#04141F]">
          <h2 id="limits-heading" className="text-xs font-mono font-black uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
            Who decides &amp; how odds work
          </h2>
          <ul className="text-xs font-medium text-[var(--text-muted)] space-y-1 list-disc list-inside">
            <li><strong>The judge alone calls it.</strong> A dishonest judge keeps the result; always check who the judge is.</li>
            <li><strong>If nobody backed the outcome, or the judge never calls it,</strong> everyone is refunded.</li>
            <li><strong>The odds move until betting closes.</strong> Current payout figures are not final until close.</li>
          </ul>
        </section>

        {!contractAddress ? (
          <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-strong)] p-8 text-center">
            <p className="font-bold text-base">Tote contract not deployed on this network</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Please connect to BOT Chain or local testnet.</p>
          </div>
        ) : loading && markets.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-12 text-center text-sm">
            Loading parimutuel boards...
          </div>
        ) : markets.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-strong)] p-12 text-center">
            <p className="font-black text-lg">No parimutuel pools open yet</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
              Open the first prediction pot on BOT Chain.
            </p>
            <Link href="/new">
              <Button variant="primary">Open First Pool</Button>
            </Link>
          </div>
        ) : (
          /* Home is a list of boards in miniature (a bar per outcome), not cards (§3.1) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sortedMarkets.map((market) => (
              <MiniBoard
                key={market.id.toString()}
                market={market}
                totals={marketTotals[market.id.toString()] || []}
                nowSecs={nowSecs}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function MiniBoard({ market, totals, nowSecs }: { market: MarketInfo; totals: bigint[]; nowSecs: bigint }) {
  const currentPhase = phase(market, nowSecs);
  const totalPool = market.total;
  const optShares = shares(totals, totalPool);

  const phaseTag = {
    open: "bg-[#2C9BE8] text-white",
    closing_soon: "bg-[var(--warning)] text-white animate-pulse",
    closed_waiting_judge: "bg-[#04141F] text-[var(--accent)]",
    expired_silent: "bg-[var(--danger)] text-white",
    decided: "bg-[var(--success)] text-white",
    void: "bg-[#687279] text-white",
  }[currentPhase];

  const phaseText = {
    open: "Open for Bets",
    closing_soon: "Closing Soon",
    closed_waiting_judge: "Waiting for Judge",
    expired_silent: "Judge Silent",
    decided: "Decided",
    void: "Voided",
  }[currentPhase];

  return (
    <Link
      href={`/market/${market.id.toString()}`}
      className="block group bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] shadow-[3px_3px_0px_#04141F] hover:shadow-[5px_5px_0px_#04141F] hover:-translate-y-0.5 transition-all p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-black text-base uppercase tracking-tight text-[var(--text-primary)] group-hover:underline line-clamp-2">
          {market.question}
        </h3>
        <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs shrink-0 ${phaseTag}`}>
          {phaseText}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)] mb-3 pb-2 border-b border-[var(--border-subtle)]">
        <span>Pot: <strong className="text-[var(--text-primary)] font-bold">{formatEther(totalPool)} BOT</strong></span>
        <span>Judge Fee: {market.judgeBps / 100}%</span>
      </div>

      {/* Outcome Mini Bars */}
      <div className="space-y-1.5 my-3">
        {market.options.map((opt, idx) => {
          const pct = optShares[idx] || 0;
          const isWinner = market.state === MarketState.Decided && market.winner === idx;

          return (
            <div key={idx} className="text-xs">
              <div className="flex justify-between font-mono text-[11px] mb-0.5">
                <span className={isWinner ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                  {isWinner ? "🏆 " : ""}{opt}
                </span>
                <span className="font-bold">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-[var(--bg-overlay)] border border-[var(--border-default)] overflow-hidden">
                <div
                  className={`h-full ${isWinner ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono">
        <span className="text-[var(--text-muted)]">Judge: {market.judge.slice(0, 6)}…{market.judge.slice(-4)}</span>
        <span className="font-bold text-[var(--text-primary)] group-hover:translate-x-0.5 transition-transform">
          View Board &rarr;
        </span>
      </div>
    </Link>
  );
}
