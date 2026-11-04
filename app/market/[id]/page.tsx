"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/lib/useChainWrite";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import OddsBoard from "@/components/oddsboard/OddsBoard";
import { TOTE_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { MarketInfo, MarketState, phase, payout } from "@/lib/tote";
import { humanizeToteError } from "@/lib/errors";

export default function MarketDetailPage() {
  const params = useParams();
  const rawId = params.id as string;
  const marketId = BigInt(rawId || "0");

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [totals, setTotals] = useState<bigint[]>([]);
  const [userStakes, setUserStakes] = useState<bigint[]>([]);
  const [userQuote, setUserQuote] = useState<bigint>(0n);
  const [nowSecs, setNowSecs] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));
  const [loading, setLoading] = useState(true);

  // Bet Form
  const [selectedOption, setSelectedOption] = useState<number>(0);
  const [betAmount, setBetAmount] = useState("0.1");
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);

  // Judge / Settle actions
  const [decidingOption, setDecidingOption] = useState<number>(0);
  const [deciding, setDeciding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMarket() {
      if (!publicClient || !contractAddress || marketId <= 0n) {
        setLoading(false);
        return;
      }

      try {
        const block = await publicClient.getBlock();
        if (!cancelled) setNowSecs(block.timestamp);

        const raw = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "marketOf",
          args: [marketId],
        })) as any;

        const opts = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "optionsOf",
          args: [marketId],
        })) as string[];

        const tots = (await publicClient.readContract({
          address: contractAddress,
          abi: TOTE_ABI,
          functionName: "totals",
          args: [marketId],
        })) as readonly bigint[];

        let stakes: bigint[] = opts.map(() => 0n);
        let quote = 0n;

        if (address) {
          const s = (await publicClient.readContract({
            address: contractAddress,
            abi: TOTE_ABI,
            functionName: "stakeOf",
            args: [marketId, address],
          })) as readonly bigint[];
          stakes = [...s];

          quote = (await publicClient.readContract({
            address: contractAddress,
            abi: TOTE_ABI,
            functionName: "quoteClaim",
            args: [marketId, address],
          })) as bigint;
        }

        if (!cancelled) {
          setMarket({
            id: marketId,
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
          setTotals([...tots]);
          setUserStakes(stakes);
          setUserQuote(quote);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load market:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadMarket();
    const interval = setInterval(loadMarket, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress, marketId, address]);

  // Bet Submit
  async function handleBet(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !contractAddress || !market) return;

    setBetError(null);
    setBetting(true);

    try {
      const valWei = parseEther(betAmount);
      if (valWei < parseEther("0.001")) {
        throw new Error("Minimum bet is 0.001 BOT.");
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "bet",
        args: [marketId, selectedOption],
        value: valWei,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setBetAmount("0.1");
    } catch (err: any) {
      console.error(err);
      setBetError(humanizeToteError(err));
    } finally {
      setBetting(false);
    }
  }

  // Judge Decide
  async function handleDecide(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !contractAddress) return;

    setActionError(null);
    setDeciding(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "decide",
        args: [marketId, decidingOption],
      });

      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeToteError(err));
    } finally {
      setDeciding(false);
    }
  }

  // Claim
  async function handleClaim() {
    if (!publicClient || !contractAddress) return;
    setActionError(null);
    setClaiming(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "claim",
        args: [marketId],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setUserQuote(0n);
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeToteError(err));
    } finally {
      setClaiming(false);
    }
  }

  // Refund
  async function handleRefund() {
    if (!publicClient || !contractAddress) return;
    setActionError(null);
    setRefunding(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "refund",
        args: [marketId],
      });

      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeToteError(err));
    } finally {
      setRefunding(false);
    }
  }

  // Expire
  async function handleExpire() {
    if (!publicClient || !contractAddress) return;
    setActionError(null);
    setExpiring(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "expire",
        args: [marketId],
      });

      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeToteError(err));
    } finally {
      setExpiring(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Loading Pool..." activeTab="markets">
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-12 text-center text-sm font-mono">
          Loading racetrack odds board...
        </div>
      </PageShell>
    );
  }

  if (!market) {
    return (
      <PageShell title="Pool Not Found" activeTab="markets">
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-8 text-center space-y-4">
          <p className="font-bold text-base">Pool #{marketId.toString()} does not exist</p>
          <Link href="/">
            <Button variant="secondary" size="sm">Back to Boards</Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  const isJudge = address?.toLowerCase() === market.judge.toLowerCase();
  const currentPhase = phase(market, nowSecs);
  const isOpen = currentPhase === "open" || currentPhase === "closing_soon";
  const isDecided = market.state === MarketState.Decided;
  const isVoid = market.state === MarketState.Void;
  const userTotalStake = userStakes.reduce((a, b) => a + b, 0n);

  // Preview payout calculation for the bet line (§3.4)
  const betValWei = (() => {
    try {
      return parseEther(betAmount || "0");
    } catch {
      return 0n;
    }
  })();
  const simTotal = market.total + betValWei;
  const simOptTotal = (totals[selectedOption] || 0n) + betValWei;
  const simPayout = payout(betValWei, simOptTotal, simTotal, market.judgeBps);
  const previewCollect = (Number(simPayout) / 1e18).toFixed(3);
  const selectedOptName = market.options[selectedOption] || "Selected Outcome";

  return (
    <PageShell
      title={market.question}
      subtitle={`Judge: ${market.judge} · Fee: ${market.judgeBps / 100}% · Pool: ${formatEther(market.total)} BOT`}
      activeTab="markets"
      badge={
        isJudge ? (
          <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 bg-[var(--accent)] text-[var(--accent-ink)] border border-[var(--border-strong)]">
            You are the Judge
          </span>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {actionError && (
          <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-mono font-bold">
            {actionError}
          </div>
        )}

        {/* The Racetrack Tote Odds Board */}
        <OddsBoard
          market={market}
          totals={totals}
          userStakes={userStakes}
          selectedOption={selectedOption}
          onSelectOption={isOpen && !isJudge ? setSelectedOption : undefined}
        />

        {/* Action Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Bet Form or Settlement info */}
          {isOpen ? (
            <Panel heading="Back an Outcome">
              {isJudge ? (
                <div className="p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-strong)] text-xs font-mono">
                  <strong>You are the designated judge.</strong> You cannot place bets on this pool.
                </div>
              ) : (
                <form onSubmit={handleBet} className="space-y-4">
                  {betError && (
                    <div className="p-2 bg-[#FDF0ED] border border-[var(--danger)] text-[var(--danger)] text-xs font-mono">
                      {betError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="optionSelect" className="block text-xs font-mono font-bold uppercase tracking-wider mb-1">
                      Select Outcome
                    </label>
                    <select
                      id="optionSelect"
                      value={selectedOption}
                      onChange={(e) => setSelectedOption(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--menu-bg)] text-[var(--menu-fg)] border-2 border-[var(--menu-border)] text-sm font-semibold outline-none"
                    >
                      {market.options.map((name, idx) => (
                        <option key={idx} value={idx}>
                          [0{idx + 1}] {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="amount" className="block text-xs font-mono font-bold uppercase tracking-wider mb-1">
                      Stake Amount (BOT)
                    </label>
                    <input
                      id="amount"
                      type="number"
                      step="any"
                      min="0.001"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] font-mono text-base font-bold outline-none"
                    />
                    <span className="text-[11px] font-mono text-[var(--text-muted)] mt-1 block">
                      Min: 0.001 BOT
                    </span>
                  </div>

                  {/* Spec §3.4 Bet Line & Warning */}
                  <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] text-xs font-mono">
                    <p className="font-bold text-[var(--text-primary)]">
                      Back {selectedOptName} with {betAmount || "0"} BOT. If nothing else changes you collect {previewCollect} BOT.
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      * The odds move until betting closes. Now is not final.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={betting}
                    disabled={!isConnected || betting}
                    className="w-full"
                  >
                    {!isConnected ? "Connect Wallet to Bet" : "Place Bet"}
                  </Button>
                </form>
              )}
            </Panel>
          ) : isDecided ? (
            <Panel heading="Settlement &amp; Claims">
              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 bg-[#FFF9D2] border-2 border-[var(--border-strong)]">
                  <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">Winning Outcome</div>
                  <div className="text-lg font-black text-[var(--text-primary)]">
                    🏆 {market.options[market.winner]}
                  </div>
                </div>

                {userQuote > 0n ? (
                  <div className="p-3 bg-[#E8F8ED] border-2 border-[#1F7A3D] space-y-2">
                    <div className="font-bold text-[#1F7A3D]">You backed the winning outcome!</div>
                    <div className="text-sm font-black">
                      Available to Claim: {formatEther(userQuote)} BOT
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={claiming}
                      disabled={claiming}
                      onClick={handleClaim}
                      className="w-full"
                    >
                      Claim Winnings
                    </Button>
                  </div>
                ) : userStakes[market.winner] > 0n ? (
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                    You have already claimed your share of the pool.
                  </div>
                ) : userTotalStake > 0n ? (
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                    You did not back the winning outcome on this market.
                  </div>
                ) : (
                  <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                    No active stakes held on this market.
                  </div>
                )}
              </div>
            </Panel>
          ) : isVoid ? (
            <Panel heading="Market Voided">
              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)]">
                  <strong>This pool was voided.</strong> All stakes are fully refundable.
                </div>
                {userTotalStake > 0n && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={refunding}
                    disabled={refunding}
                    onClick={handleRefund}
                    className="w-full"
                  >
                    Refund {formatEther(userTotalStake)} BOT Stake
                  </Button>
                )}
              </div>
            </Panel>
          ) : (
            <Panel heading="Betting Closed">
              <div className="space-y-2 text-xs font-mono">
                <p>Betting has closed. Waiting for the named judge to call the winning outcome.</p>
                <p className="text-[var(--text-muted)]">
                  Deadline for judge: {new Date(Number(market.decideBy) * 1000).toLocaleString()}
                </p>
                {currentPhase === "expired_silent" && (
                  <div className="pt-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={expiring}
                      disabled={expiring}
                      onClick={handleExpire}
                    >
                      Expire &amp; Void Pool (Judge Silent)
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Right Column: Judge Console & Pool Metrics */}
          <div className="space-y-4">
            {isJudge && (
              <Panel heading="Judge Console">
                <div className="space-y-3 text-xs font-mono">
                  {currentPhase === "closed_waiting_judge" ? (
                    <form onSubmit={handleDecide} className="space-y-3">
                      <p>
                        Betting is closed. You must now select and verify the true outcome:
                      </p>
                      <select
                        value={decidingOption}
                        onChange={(e) => setDecidingOption(parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-[var(--menu-bg)] text-[var(--menu-fg)] border-2 border-[var(--menu-border)] text-sm font-semibold outline-none"
                      >
                        {market.options.map((name, idx) => (
                          <option key={idx} value={idx}>
                            [0{idx + 1}] {name} ({formatEther(totals[idx] || 0n)} BOT)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        * Note: If you select an outcome with 0 BOT staked, the pool is voided and refunded.
                      </p>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        loading={deciding}
                        disabled={deciding}
                        className="w-full"
                      >
                        Declare Winner
                      </Button>
                    </form>
                  ) : isOpen ? (
                    <p className="text-[var(--text-muted)]">
                      Betting is still active. The decision console unlocks after betting closes at{" "}
                      {new Date(Number(market.closesAt) * 1000).toLocaleTimeString()}.
                    </p>
                  ) : (
                    <p className="text-[var(--text-muted)]">
                      Decision phase completed.
                    </p>
                  )}
                </div>
              </Panel>
            )}

            <Panel heading="Pool Information">
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                  <span>Judge:</span>
                  <a
                    href={`https://scan.botchain.ai/address/${market.judge}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline hover:opacity-80 truncate max-w-[180px]"
                  >
                    {market.judge}
                  </a>
                </div>
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                  <span>Closes At:</span>
                  <span>{new Date(Number(market.closesAt) * 1000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                  <span>Decision Window:</span>
                  <span>Until {new Date(Number(market.decideBy) * 1000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Total Stakes:</span>
                  <span className="font-bold">{formatEther(userTotalStake)} BOT</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
