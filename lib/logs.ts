import { parseAbiItem } from "viem";

export const OPENED_EVENT = parseAbiItem(
  "event Opened(uint256 indexed id, address indexed creator, string question, address indexed judge, uint16 judgeBps, uint64 closesAt, uint64 decideBy)"
);

export const BET_EVENT = parseAbiItem(
  "event Bet(uint256 indexed id, address indexed who, uint8 indexed option, uint256 amount, uint256 optionTotal, uint256 total)"
);

export const DECIDED_EVENT = parseAbiItem(
  "event Decided(uint256 indexed id, uint8 indexed option, uint256 fee, uint256 pool)"
);

export const VOIDED_EVENT = parseAbiItem(
  "event Voided(uint256 indexed id, string reason)"
);

export const CLAIMED_EVENT = parseAbiItem(
  "event Claimed(uint256 indexed id, address indexed who, uint256 stake, uint256 payout)"
);

export const REFUNDED_EVENT = parseAbiItem(
  "event Refunded(uint256 indexed id, address indexed who, uint256 amount)"
);

export const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed to, uint256 amount)"
);
