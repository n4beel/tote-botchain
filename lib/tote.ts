export const TOTE_CONSTANTS = {
  MAX_QUESTION_BYTES: 120,
  MAX_OPTION_BYTES: 32,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 6,
  MIN_BET: 1000000000000000n, // 0.001 ether
  MAX_JUDGE_BPS: 500, // 5%
  MIN_CLOSE: 3600n, // 1 hours
  MAX_CLOSE: 7776000n, // 90 days
  MIN_DECIDE: 86400n, // 1 days
  MAX_DECIDE: 2592000n, // 30 days
  MAX_PAGE: 50,
} as const;

export enum MarketState {
  Open = 0,
  Decided = 1,
  Void = 2,
}

export interface MarketInfo {
  id: bigint;
  creator: `0x${string}`;
  judge: `0x${string}`;
  closesAt: bigint;
  decideBy: bigint;
  judgeBps: number;
  optionCount: number;
  winner: number;
  state: MarketState;
  total: bigint;
  credited: bigint;
  paidOut: bigint;
  claimedStake: bigint;
  question: string;
  options: string[];
}

/**
 * Floor payout calculation mirroring contract claim() for non-last winner
 */
export function payout(stake: bigint, optionTotal: bigint, total: bigint, judgeBps: number): bigint {
  if (optionTotal === 0n || stake === 0n) return 0n;
  const fee = (total * BigInt(judgeBps)) / 10000n;
  const pool = total - fee;
  return (stake * pool) / optionTotal;
}

/**
 * Implied payout per 1 BOT stake (floor; formatted string)
 * Returns "—" if option has no stake yet
 */
export function impliedPay(optionTotal: bigint, total: bigint, judgeBps: number): string {
  if (optionTotal === 0n) return "—";
  const oneBot = 1000000000000000000n;
  const pay = payout(oneBot, optionTotal, total, judgeBps);
  const num = Number(pay) / 1e18;
  return num.toFixed(3);
}

/**
 * Percentage shares per option total out of total pool
 */
export function shares(totals: bigint[], total: bigint): number[] {
  if (total === 0n) {
    return totals.map(() => 0);
  }
  return totals.map((t) => Number((t * 10000n) / total) / 100);
}

/**
 * Lifecycle phase of market
 */
export function phase(
  market: { state: MarketState; closesAt: bigint; decideBy: bigint },
  nowSecs: bigint
): "open" | "closing_soon" | "closed_waiting_judge" | "expired_silent" | "decided" | "void" {
  if (market.state === MarketState.Decided) return "decided";
  if (market.state === MarketState.Void) return "void";

  if (nowSecs < market.closesAt) {
    if (market.closesAt - nowSecs < 1800n) return "closing_soon";
    return "open";
  }

  if (nowSecs <= market.decideBy) {
    return "closed_waiting_judge";
  }

  return "expired_silent";
}
