import React from "react";
import { formatEther } from "viem";
import { MarketInfo, impliedPay, shares } from "@/lib/tote";

export interface OddsBoardProps {
  market: MarketInfo;
  totals: bigint[];
  userStakes: bigint[];
  onSelectOption?: (idx: number) => void;
  selectedOption?: number | null;
}

export function OddsBoard({
  market,
  totals,
  userStakes,
  onSelectOption,
  selectedOption,
}: OddsBoardProps) {
  const totalPool = market.total;
  const optShares = shares(totals, totalPool);
  const isDecided = market.state === 1; // MarketState.Decided
  const isVoid = market.state === 2;    // MarketState.Void

  return (
    <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] shadow-[4px_4px_0px_#04141F] rounded-sm overflow-hidden">
      {/* Board Header Strip */}
      <div className="bg-[#04141F] text-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] font-bold">
            POOL QUESTION #{market.id.toString()}
          </span>
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">{market.question}</h2>
        </div>
        <div className="text-right font-mono">
          <div className="text-[11px] text-white/70 uppercase">Total Pot</div>
          <div className="text-lg font-black text-[var(--accent)]">{formatEther(totalPool)} BOT</div>
        </div>
      </div>

      {/* Racetrack Table Headers (§8 checklist 3: HTML table with real headers) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-elevated)] border-b-2 border-[var(--border-strong)] text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[140px]">Outcome</th>
              <th className="py-2.5 px-3 min-w-[180px]">Pool Share</th>
              <th className="py-2.5 px-3 text-right">Staked</th>
              <th className="py-2.5 px-3 text-right">Pays Per 1 BOT</th>
              <th className="py-2.5 px-3 text-right">Your Stake</th>
            </tr>
          </thead>
          <tbody>
            {market.options.map((optName, idx) => {
              const optTotal = totals[idx] || 0n;
              const userStake = userStakes[idx] || 0n;
              const payoutPer1 = impliedPay(optTotal, totalPool, market.judgeBps);
              const pct = optShares[idx] || 0;
              const isWinner = isDecided && market.winner === idx;
              const isSelected = selectedOption === idx;

              return (
                <tr
                  key={idx}
                  onClick={onSelectOption ? () => onSelectOption(idx) : undefined}
                  className={`border-b border-[var(--border-subtle)] text-sm transition-colors ${
                    isWinner
                      ? "bg-[#FFF9D2] font-bold"
                      : isSelected
                      ? "bg-[var(--bg-overlay)]"
                      : "hover:bg-[var(--bg-elevated)]"
                  } ${onSelectOption ? "cursor-pointer" : ""}`}
                >
                  {/* Option number */}
                  <td className="py-3 px-3 text-center font-mono font-bold text-xs">
                    {isWinner ? "🏆" : `[0${idx + 1}]`}
                  </td>

                  {/* Option title & winner tag */}
                  <td className="py-3 px-3 font-bold text-[var(--text-primary)]">
                    <div className="flex items-center gap-2">
                      <span>{optName}</span>
                      {isWinner && (
                        <span className="text-[9px] uppercase px-1.5 py-0.5 bg-[var(--accent)] text-[var(--accent-ink)] border border-[var(--border-strong)] font-mono font-black">
                          Winner
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Visual Odds Bar (§3.1) */}
                  <td className="py-3 px-3">
                    <div className="odds-bar-track rounded-xs">
                      <div
                        className="odds-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 block">
                      {pct.toFixed(1)}% of pot
                    </span>
                  </td>

                  {/* Total staked on option */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-xs">
                    {formatEther(optTotal)} BOT
                  </td>

                  {/* "Pays X per 1 BOT" in mono digits (§3.1) */}
                  <td className="py-3 px-3 text-right font-mono font-black text-sm text-[var(--text-primary)]">
                    {payoutPer1 !== "—" ? `${payoutPer1}x` : "—"}
                  </td>

                  {/* User Stake */}
                  <td className="py-3 px-3 text-right font-mono text-xs">
                    {userStake > 0n ? (
                      <span className="font-bold text-[var(--text-primary)] px-1.5 py-0.5 bg-[var(--accent)] border border-[var(--border-strong)] rounded-xs">
                        {formatEther(userStake)} BOT
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OddsBoard;
