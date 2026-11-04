export function humanizeToteError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("BadQuestion")) {
    return "Question must be between 1 and 120 characters.";
  }
  if (msg.includes("BadOptions")) {
    return "You must provide between 2 and 6 non-empty options (max 32 chars each).";
  }
  if (msg.includes("BadJudge")) {
    return "Invalid judge address. Please provide a valid, trusted address.";
  }
  if (msg.includes("BadFee")) {
    return "Judge fee cannot exceed 500 bps (5%).";
  }
  if (msg.includes("BadTimes")) {
    return "Invalid duration. Close time must be 1h-90d, and decision window 1d-30d.";
  }
  if (msg.includes("MarketNotFound")) {
    return "Market not found.";
  }
  if (msg.includes("Closed")) {
    return "Betting has closed.";
  }
  if (msg.includes("BadOption")) {
    return "Invalid option selection.";
  }
  if (msg.includes("JudgeCannotBet")) {
    return "The judge can't bet on their own market.";
  }
  if (msg.includes("BetTooSmall")) {
    return "Minimum bet is 0.001 BOT.";
  }
  if (msg.includes("NotJudge")) {
    return "Only the designated judge can decide the outcome.";
  }
  if (msg.includes("NotDeciding")) {
    return "The judge can only decide between market close and the decision deadline.";
  }
  if (msg.includes("StillDeciding")) {
    return "The decision window is still open for the judge.";
  }
  if (msg.includes("MarketNotDecided")) {
    return "Market has not been decided yet.";
  }
  if (msg.includes("MarketNotVoid")) {
    return "Market is not voided.";
  }
  if (msg.includes("NothingToClaim")) {
    return "No winning stakes or refundable balance to claim.";
  }
  if (msg.includes("AlreadySettled")) {
    return "You have already claimed or refunded your stake for this market.";
  }
  if (msg.includes("NothingToWithdraw")) {
    return "No pending funds available to withdraw.";
  }
  if (msg.includes("TransferFailed")) {
    return "BOT transfer failed.";
  }
  if (msg.includes("User rejected") || msg.includes("denied transaction signature")) {
    return "Transaction was cancelled in your wallet.";
  }

  return msg.slice(0, 160);
}
