import { describe, it, expect } from "vitest";
import {
  payout,
  impliedPay,
  shares,
  phase,
  MarketState,
} from "../tote";

describe("tote library", () => {
  describe("payout and impliedPay", () => {
    it("computes floor payout proportional to stake in pool", () => {
      // Total: 10 BOT, Fee 0%. Option has 2 BOT staked. User staked 1 BOT.
      // Pool = 10 BOT. Payout = 1 * 10 / 2 = 5 BOT.
      const total = 10_000000000000000000n;
      const optTotal = 2_000000000000000000n;
      const userStake = 1_000000000000000000n;

      const p = payout(userStake, optTotal, total, 0);
      expect(p).toBe(5_000000000000000000n);

      const imp = impliedPay(optTotal, total, 0);
      expect(imp).toBe("5.000");
    });

    it("factors in judge fee", () => {
      // Total 10 BOT, Judge fee 5% (500 bps). Pool = 9.5 BOT.
      // Option has 2 BOT staked. Payout per 1 BOT = 9.5 / 2 = 4.75 BOT.
      const total = 10_000000000000000000n;
      const optTotal = 2_000000000000000000n;
      const imp = impliedPay(optTotal, total, 500);
      expect(imp).toBe("4.750");
    });

    it("returns dash when option has 0 stake", () => {
      expect(impliedPay(0n, 10n, 0)).toBe("—");
    });
  });

  describe("shares", () => {
    it("computes percentage splits correctly", () => {
      const totals = [20n, 50n, 30n];
      const s = shares(totals, 100n);
      expect(s).toEqual([20, 50, 30]);
    });
  });

  describe("phase", () => {
    const market = {
      state: MarketState.Open,
      closesAt: 1_000_000n,
      decideBy: 1_200_000n,
    };

    it("identifies open phase", () => {
      expect(phase(market, 900_000n)).toBe("open");
    });

    it("identifies closing soon", () => {
      expect(phase(market, 999_000n)).toBe("closing_soon");
    });

    it("identifies closed waiting for judge", () => {
      expect(phase(market, 1_050_000n)).toBe("closed_waiting_judge");
    });

    it("identifies expired silent", () => {
      expect(phase(market, 1_250_000n)).toBe("expired_silent");
    });
  });
});
