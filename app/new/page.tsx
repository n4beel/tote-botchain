"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/lib/useChainWrite";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { TOTE_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { humanizeToteError } from "@/lib/errors";

export default function NewMarketPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [judge, setJudge] = useState("");
  const [judgeFeePercent, setJudgeFeePercent] = useState("2");
  const [closeHours, setCloseHours] = useState("24");
  const [decideDays, setDecideDays] = useState("2");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddOption() {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  }

  function handleRemoveOption(idx: number) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  }

  function handleOptionChange(idx: number, val: string) {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !contractAddress) return;

    setError(null);
    setSubmitting(true);

    try {
      if (question.trim().length === 0 || question.length > 120) {
        throw new Error("Question must be between 1 and 120 characters.");
      }

      const trimmedOptions = options.map((o) => o.trim());
      if (trimmedOptions.some((o) => o.length === 0 || o.length > 32)) {
        throw new Error("All options must be between 1 and 32 characters.");
      }

      if (!isAddress(judge)) {
        throw new Error("Please enter a valid Ethereum address for the judge.");
      }

      const feePct = parseFloat(judgeFeePercent);
      if (isNaN(feePct) || feePct < 0 || feePct > 5) {
        throw new Error("Judge fee must be between 0% and 5% (max 500 bps).");
      }
      const judgeBps = Math.round(feePct * 100);

      const cHrs = parseFloat(closeHours);
      if (isNaN(cHrs) || cHrs < 1 || cHrs > 2160) {
        throw new Error("Betting duration must be between 1 hour and 90 days.");
      }
      const closeSecs = BigInt(Math.round(cHrs * 3600));

      const dDays = parseFloat(decideDays);
      if (isNaN(dDays) || dDays < 1 || dDays > 30) {
        throw new Error("Decision window must be between 1 and 30 days.");
      }
      const decideSecs = BigInt(Math.round(dDays * 86400));

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "open",
        args: [
          question.trim(),
          trimmedOptions,
          judge as Address,
          judgeBps,
          closeSecs,
          decideSecs,
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const totalMarkets = (await publicClient.readContract({
        address: contractAddress,
        abi: TOTE_ABI,
        functionName: "marketCount",
      })) as bigint;

      router.push(`/market/${totalMarkets.toString()}`);
    } catch (err: any) {
      console.error(err);
      setError(humanizeToteError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="Open a Parimutuel Pool"
      subtitle="Define a question with 2-6 outcomes, name a trusted judge, and set the pot parameters."
      activeTab="new"
    >
      <div className="max-w-xl mx-auto">
        <Panel heading="Market Configuration">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-bold font-mono">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="question" className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Question (Max 120 chars)
              </label>
              <input
                id="question"
                type="text"
                maxLength={120}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Which team wins the Premier League?"
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] text-sm outline-none font-bold"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Outcomes (2 to 6)
                </label>
                {options.length < 6 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="text-xs font-bold uppercase text-[var(--border-default)] hover:underline cursor-pointer"
                  >
                    + Add Outcome
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs w-6 text-center">
                      [0{idx + 1}]
                    </span>
                    <input
                      type="text"
                      maxLength={32}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Outcome ${idx + 1}`}
                      required
                      className="flex-1 px-3 py-1.5 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] text-sm outline-none font-semibold"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="px-2 py-1 text-xs text-[var(--danger)] font-bold hover:underline cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="judge" className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Named Judge Address
              </label>
              <input
                id="judge"
                type="text"
                value={judge}
                onChange={(e) => setJudge(e.target.value)}
                placeholder="0x... trusted judge"
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] font-mono text-xs outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1 font-mono">
                The judge cannot bet on this market and alone declares the winning outcome.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="fee" className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Judge Fee (%)
                </label>
                <input
                  id="fee"
                  type="number"
                  step="any"
                  min="0"
                  max="5"
                  value={judgeFeePercent}
                  onChange={(e) => setJudgeFeePercent(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] text-sm font-mono outline-none"
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Max 5%</span>
              </div>

              <div>
                <label htmlFor="closeHours" className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Betting (Hours)
                </label>
                <input
                  id="closeHours"
                  type="number"
                  step="any"
                  min="1"
                  max="2160"
                  value={closeHours}
                  onChange={(e) => setCloseHours(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] text-sm font-mono outline-none"
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono">1h to 90d</span>
              </div>

              <div>
                <label htmlFor="decideDays" className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Decide (Days)
                </label>
                <input
                  id="decideDays"
                  type="number"
                  step="any"
                  min="1"
                  max="30"
                  value={decideDays}
                  onChange={(e) => setDecideDays(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] text-sm font-mono outline-none"
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono">1d to 30d</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!isConnected || submitting}
                className="w-full"
              >
                {!isConnected ? "Connect Wallet to Open" : "Open Pool Board"}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
