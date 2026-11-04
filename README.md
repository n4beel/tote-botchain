# Tote (`tote-botchain`)

Back an outcome. The winners split the pot.

Tote is an onchain parimutuel wagering platform built on Ethereum / BotChain. Backers pool collateral into distinct outcome options for community questions or sports events, and upon resolution by a trusted judge, winning backers split the entire pot proportionally to their stake.

---

## Design System & Theme

- **Archetype**: AP — Odds board (Parimutuel ledger / sports book display)
- **Palette**:
  - Ground: `#2C9BE8` (Vibrant blue)
  - Ink: `#04141F` (Dark navy text)
  - Accent: `#FFE14D` (Odds yellow / action highlight)
  - Cards: `#1F7BB8` / `#166296`
- **Typography**:
  - Primary Font: Epilogue (Humanist display / headings)
  - Numeric / Data Font: Oxygen Mono (Monospace odds, stake totals, times)
- **WCAG Contrast Ratios**:
  - Accent (`#FFE14D`) on Ink (`#04141F`): **14.34:1** (AAA)
  - Ground (`#2C9BE8`) on Ink (`#04141F`): **6.19:1** (AA)
  - Card Bg (`#1F7BB8`) on Text Bright (`#FFFFFF`): **4.58:1** (AA)

---

## Key Features

- **Dynamic Parimutuel Odds**: Live implied probability, decimal odds, and pot calculations updated per wager.
- **Judge Conflict Prevention**: Designated market judges are forbidden from placing bets on their own questions (`JudgeCannotBet`).
- **Rounding Dust Conservation**: Final claimer absorbs leftover division dust (`pool - paidOut`), ensuring 100% of the pot is distributed.
- **Automated Voiding & Sweep**: Markets with no winning backers or silent judges automatically void, allowing safe 100% principal refunds.
- **Pull Withdrawals**: Claims and refunds credit to an internal balance, protected by non-reentrant single-transaction withdrawal.
- **Full Keyboard & Accessible Navigation**: Comprehensive screen reader support, accessible table view for tabular odds display, and keyboard navigation.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start local dev stack (Anvil on port 8755 + contract deploy)
node scripts/local-stack.mjs

# Run Next.js web application
npm run dev
```

---

## Testing & Verification

```bash
# Solidity unit, fuzz, and invariant tests
cd contracts && forge test

# TypeScript typecheck
npm run typecheck

# Unit tests
npm test

# Integration tests (against isolated Anvil on port 8655)
npm run test:integration

# Next.js production build
npm run build
```
