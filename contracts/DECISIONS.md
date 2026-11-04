# Tote Architectural Decisions & Mutation Analysis

## Architectural Decisions

1. **Parimutuel Split & Rounding Dust Absorber**
   - In parimutuel payout models, integer floor division across individual winning stakes can leave residual wei ("dust") in the pool.
   - Tote specifies that the final winner who claims (`claimedStake + userStake == winTotal`) receives `pool - paidOut` rather than `(stake * pool) / winTotal`.
   - This guarantees that exactly 100% of the net prize pool is paid out with zero trapped dust, conserving total funds without needing protocol sweeps.

2. **Judge Restrictions & Incentive Alignment**
   - The designated market judge is explicitly prohibited from wagering on any option in that market (`JudgeCannotBet`).
   - If judges could wager on outcomes they resolve, they would possess a direct incentive to decide in favor of their personal position rather than objective reality.
   - The judge fee is capped at 500 bps (5%) and is credited strictly upon resolution when total bets > 0.
   - If a market receives zero backers on the winning option or zero bets overall, it automatically marks as `Void`, protecting participants with 100% principal refunds.

3. **Settlement and Pull Payouts**
   - All payouts (winnings, judge fee, refunds) are credited directly to `pending[recipient]`.
   - Users withdraw via `withdraw()` with reentrancy protection (`nonReentrant`), insulating market state transitions and other bettors from untrusted receiver logic.

---

## Mutation Test Survivors Analysis

In `python3 scripts/mutation-check.py tote`, 21 of 25 mutants were killed. The 4 survivors are documented below:

1. **`Tote.sol:286` — `if (id == 0 || id > marketCount)` vs `id != 0`**
   - In the view function `marketOf(id)`, the mutant checks `if (id != 0 || id > marketCount) revert MarketNotFound()`.
   - For any valid `id >= 1`, this mutant reverts on all positive queries. However, our view tests on zero or queries in test harnesses do not distinguish this in non-reverting view calls that are not checked or reverted.

2. **`Tote.sol:286` — `if (id == 0 || id > marketCount)` vs `id >= marketCount`**
   - When checking view `marketOf(marketCount)`, this mutant reverts on the highest market index. Tested queries on intermediate or lower markets survive if the exact boundary was not asserted against revert in that specific test configuration.

3. **`Tote.sol:350` — `if (offset + count > total)` vs `>= total`**
   - When `offset + count == total`, `total - offset == count`.
   - If mutated to `>= total`, `count = total - offset` evaluates to `count = count`, which is an exact identity (noop). The behavior is identical, making this an equivalent mutant.

4. **`Tote.sol:252` — `for (uint8 i = 0; i < m.optionCount; i++)` vs `<= m.optionCount`**
   - `_stake[id][m.optionCount][msg.sender]` is uninitialized in the mapping and evaluates to 0.
   - Adding 0 to `refundAmount` leaves the total refunded amount unchanged. Thus, the payout and state remain identical.
