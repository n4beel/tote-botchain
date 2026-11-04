import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { TOTE_CONSTANTS } from "../tote";

describe("contract limits agreement", () => {
  it("matches constants defined in Tote.sol", () => {
    const solPath = resolve(__dirname, "../../contracts/src/Tote.sol");
    const solContent = readFileSync(solPath, "utf8");

    // MAX_QUESTION_BYTES = 120
    expect(solContent).toContain("MAX_QUESTION_BYTES = 120");
    expect(TOTE_CONSTANTS.MAX_QUESTION_BYTES).toBe(120);

    // MAX_OPTION_BYTES = 32
    expect(solContent).toContain("MAX_OPTION_BYTES = 32");
    expect(TOTE_CONSTANTS.MAX_OPTION_BYTES).toBe(32);

    // MIN_OPTIONS = 2
    expect(solContent).toContain("MIN_OPTIONS = 2");
    expect(TOTE_CONSTANTS.MIN_OPTIONS).toBe(2);

    // MAX_OPTIONS = 6
    expect(solContent).toContain("MAX_OPTIONS = 6");
    expect(TOTE_CONSTANTS.MAX_OPTIONS).toBe(6);

    // MIN_BET = 0.001 ether
    expect(solContent).toContain("MIN_BET = 0.001 ether");
    expect(TOTE_CONSTANTS.MIN_BET).toBe(1000000000000000n);

    // MAX_JUDGE_BPS = 500
    expect(solContent).toContain("MAX_JUDGE_BPS = 500");
    expect(TOTE_CONSTANTS.MAX_JUDGE_BPS).toBe(500);

    // MIN_CLOSE = 1 hours
    expect(solContent).toContain("MIN_CLOSE = 1 hours");
    expect(TOTE_CONSTANTS.MIN_CLOSE).toBe(3600n);

    // MAX_CLOSE = 90 days
    expect(solContent).toContain("MAX_CLOSE = 90 days");
    expect(TOTE_CONSTANTS.MAX_CLOSE).toBe(7776000n);

    // MIN_DECIDE = 1 days
    expect(solContent).toContain("MIN_DECIDE = 1 days");
    expect(TOTE_CONSTANTS.MIN_DECIDE).toBe(86400n);

    // MAX_DECIDE = 30 days
    expect(solContent).toContain("MAX_DECIDE = 30 days");
    expect(TOTE_CONSTANTS.MAX_DECIDE).toBe(2592000n);

    // MAX_PAGE = 50
    expect(solContent).toContain("MAX_PAGE = 50");
    expect(TOTE_CONSTANTS.MAX_PAGE).toBe(50);
  });
});
