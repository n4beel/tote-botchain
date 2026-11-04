"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/lib/useChainWrite";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { TOTE_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { MarketInfo, MarketState } from "@/lib/tote";
import { humanizeToteError } from "@/lib/errors";

interface UserMarketEntry {
  market: MarketInfo;
  stakes: bigint[];
  quote: bigint;
  isJudge: boolean;
}

export default function MeTotePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [entries, setEntries] = useState<UserMarketEntry[]>([]);
  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUserData() {
      if (!publicClient || !contractAddress || !address) {
        setLoading(false);
        return;
      }

      try {
        // 1. Pending balance
        const pBal = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "pending",
          args: [address],
        })) as bigint;

        // 2. Scan recent markets
        const totalMarkets = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "marketCount",
        })) as bigint;

        const count = totalMarkets > 50n ? 50n : totalMarkets;
        const found: UserMarketEntry[] = [];

        if (count > 0n) {
          const [ids, mData] = (await publicClient.readContract({
            address: contractAddress,
            abi: TOTE_ABI,
            functionName: "latest",
            args: [0n, count],
          })) as [readonly bigint[], readonly any[], bigint];

          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const raw = mData[i];
            const isJudge = raw.judge.toLowerCase() === address.toLowerCase();

            const s = (await publicClient.readContract({
              address: contractAddress,
              abi: TOTE_ABI,
              functionName: "stakeOf",
              args: [id, address],
            })) as readonly bigint[];

            const hasStake = s.some((amt) => amt > 0n);

            if (hasStake || isJudge) {
              const opts = (await publicClient.readContract({
                address: contractAddress,
                abi: TOTE_ABI,
                functionName: "optionsOf",
                args: [id],
              })) as string[];

              let quote = 0n;
              if (raw.state === 1) { // Decided
                quote = (await publicClient.readContract({
                  address: contractAddress,
                  abi: TOTE_ABI,
                  functionName: "quoteClaim",
                  args: [id, address],
                })) as bigint;
              }

              found.push({
                market: {
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
                },
                stakes: [...s],
                quote,
                isJudge,
              });
            }
          }
        }

        if (!cancelled) {
          setPendingBalance(pBal);
          setEntries(found);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load user tote records:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadUserData();
    const interval = setInterval(loadUserData, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress, address]);

  async function handleWithdraw() {
    if (!publicClient || !contractAddress) return;
    setError(null);
    setWithdrawing(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "withdraw",
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setPendingBalance(0n);
    } catch (err: any) {
      console.error(err);
      setError(humanizeToteError(err));
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <PageShell
      title="My Stakes &amp; Settlements"
      subtitle="Overview of your stakes across parimutuel boards, claimable payouts, and pending withdrawals."
      activeTab="me"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-mono font-bold">
            {error}
          </div>
        )}

        {!isConnected ? (
          <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-strong)] p-12 text-center">
            <p className="font-black text-lg">Wallet not connected</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Connect your wallet to inspect your active stakes and claim winnings.
            </p>
          </div>
        ) : (
          <>
            {/* Pending Balance Box */}
            <Panel heading="Pending Balance">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Available to withdraw (claimed winnings + judge fees):
                  </div>
                  <div className="text-2xl font-black text-[var(--text-primary)]">
                    {formatEther(pendingBalance)} BOT
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={withdrawing}
                  disabled={pendingBalance === 0n || withdrawing}
                  onClick={handleWithdraw}
                >
                  Withdraw to Wallet
                </Button>
              </div>
            </Panel>

            {/* List of user markets */}
            <div>
              <h2 className="text-base font-black uppercase tracking-wider mb-3">
                Your Pools ({entries.length})
              </h2>

              {loading ? (
                <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-8 text-center text-xs font-mono">
                  Scanning parimutuel boards...
                </div>
              ) : entries.length === 0 ? (
                <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-strong)] p-8 text-center">
                  <p className="font-bold text-sm">No active stakes or judging assignments</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
                    Place a bet on an open pool board to see it here.
                  </p>
                  <Link href="/">
                    <Button variant="secondary" size="sm">Browse Odds Boards</Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entries.map(({ market, stakes, quote, isJudge }) => {
                    const totalStaked = stakes.reduce((a, b) => a + b, 0n);

                    return (
                      <div
                        key={market.id.toString()}
                        className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 flex flex-col justify-between shadow-[3px_3px_0px_#04141F]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-black text-sm uppercase line-clamp-1">{market.question}</h3>
                            {isJudge && (
                              <span className="text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 bg-[var(--accent)] text-[var(--accent-ink)] border border-[var(--border-strong)]">
                                Judge
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-mono space-y-1 my-2">
                            <div className="flex justify-between">
                              <span className="text-[var(--text-muted)]">Your Total Stake:</span>
                              <span className="font-bold">{formatEther(totalStaked)} BOT</span>
                            </div>
                            {quote > 0n && (
                              <div className="flex justify-between text-[var(--success)] font-bold">
                                <span>Claimable Payout:</span>
                                <span>{formatEther(quote)} BOT</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 mt-2 border-t border-[var(--border-subtle)]">
                          <Link href={`/market/${market.id.toString()}`} className="block">
                            <Button variant="secondary" size="sm" className="w-full">
                              View Pool Board &rarr;
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
