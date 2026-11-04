# Tote Handover Document

**Project**: 55 — Tote (`tote-botchain`)  
**Archetype**: AP — Odds board (`#2C9BE8` ground, `#04141F` ink, `#FFE14D` accent)  
**Contract**: `contracts/src/Tote.sol`  
**Deploy Script**: `contracts/script/Deploy.s.sol`

---

## 1. Milestones Completed

- **Milestone 1 (Scaffold)**:
  - Repository scaffolded with `new-project.sh`. Dependencies installed and Next.js / Foundry toolchains established.
- **Milestone 2 (Contract & Invariants)**:
  - `Tote.sol` with `open`, `bet`, `decide`, `expire`, `claim`, `refund`, `withdraw`, and rich views (`marketOf`, `optionsOf`, `totals`, `stakeOf`, `quoteClaim`, `latest`).
  - 22 unit & fuzz tests + invariant testing suite (`invariant_BalanceEqualsHeldPlusPending` passing 256 runs, 32,768 calls, 0 reverts).
- **Milestone 3 (ABI & Library)**:
  - Generated typed ABI (`lib/botchain/abi.ts` with 53 entries) and utility functions in `lib/tote.ts`, `lib/errors.ts`, `lib/logs.ts`.
  - Comprehensive unit test suites in `lib/__tests__/`.
- **Milestone 4 (Integration & Local Stack)**:
  - Integration suite `test/integration/tote.test.ts` running against Anvil on port `8655`.
  - Standalone seeding script `scripts/local-stack.mjs` serving local dev chain on port `8755`.
- **Milestone 5 (Design System & Shell)**:
  - Theme styling in `app/globals.css`, `app/layout.tsx`, `components/layout/PageShell.tsx`, `components/ui/Button.tsx`, and `components/ui/Panel.tsx`.
  - Fonts configured: Epilogue and Oxygen Mono.
- **Milestone 6 (Screens & User Workflows)**:
  - Implemented `/` (Explore active & historical markets with OddsBoard), `/new` (Create a parimutuel market), `/market/[id]` (Live odds board, option backing modal, judge decision console, winner claim/refund flows), `/me` (Bettor dashboard with staked positions and pending balance pull-withdraw).
- **Milestone 7 (Verification, Mutation Check & Handover)**:
  - Mutation check killed 21/25 mutants; all 4 survivors documented in `contracts/DECISIONS.md`.
  - Full verification gates passing: `check-ui-contract.py`, `check-tokens.py`, `check-distinct.py`, `check-honesty.py`, `typecheck`, `test`, `test:integration`, and `build`.

---

## 2. Verification Gate Results

- **`check-ui-contract.py tote`**: PASSED (0 errors)
- **`check-tokens.py tote`**: PASSED (0 errors)
- **`check-distinct.py tote`**: PASSED (0 errors)
- **`check-honesty.py tote`**: PASSED (0 errors)
- **`npm run typecheck`**: PASSED (0 errors)
- **`npm test`**: PASSED (10 test suites, 49 tests)
- **`npm run test:integration`**: PASSED (2 test suites, 5 tests)
- **`npm run build`**: PASSED (Compiled all static and dynamic routes)

---

## 3. Key Contract Addresses & Ports

- **Integration Port**: `8655`
- **Local Dev Port**: `8755`
- **Network**: BotChain / Anvil (Chain ID `31337`)
