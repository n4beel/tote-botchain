// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {Tote} from "../src/Tote.sol";

contract MaliciousWithdrawer {
  Tote public tote;
  constructor(Tote _tote) {
    tote = _tote;
  }
  function attackWithdraw() external {
    tote.withdraw();
  }
  receive() external payable {
    tote.withdraw();
  }
}

contract ToteTest is Test {
  Tote public tote;
  address public creator = address(0x1111);
  address public judge = address(0x2222);
  address public alice = address(0x3333);
  address public bob = address(0x4444);
  address public charlie = address(0x5555);

  uint64 public constant CLOSE_SECS = 2 hours;
  uint64 public constant DECIDE_SECS = 2 days;
  uint16 public constant JUDGE_BPS = 300; // 3%

  function setUp() public {
    tote = new Tote();
    vm.deal(creator, 100 ether);
    vm.deal(judge, 100 ether);
    vm.deal(alice, 100 ether);
    vm.deal(bob, 100 ether);
    vm.deal(charlie, 100 ether);
  }

  function _defaultOptions() internal pure returns (string[] memory) {
    string[] memory opts = new string[](3);
    opts[0] = "Team A";
    opts[1] = "Team B";
    opts[2] = "Draw";
    return opts;
  }

  function test_OpenAndBet() public {
    vm.warp(1_000_000);
    vm.prank(creator);
    uint256 id = tote.open("Who wins the derby?", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    assertEq(id, 1);
    assertEq(tote.marketCount(), 1);

    Tote.Market memory m = tote.marketOf(id);
    assertEq(m.creator, creator);
    assertEq(m.judge, judge);
    assertEq(m.closesAt, 1_000_000 + CLOSE_SECS);
    assertEq(m.decideBy, 1_000_000 + CLOSE_SECS + DECIDE_SECS);
    assertEq(m.optionCount, 3);
    assertEq(uint8(m.state), uint8(Tote.State.Open));
    assertEq(m.winner, 255);

    // Alice bets 1 BOT on Team A
    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    uint256[] memory totals = tote.totals(id);
    assertEq(totals[0], 1 ether);
    assertEq(totals[1], 0);
    assertEq(totals[2], 0);

    uint128[] memory aliceStakes = tote.stakeOf(id, alice);
    assertEq(aliceStakes[0], 1 ether);
  }

  function test_BadOptionsJudgeFeeTimesRevert() public {
    // Empty question
    vm.expectRevert(Tote.BadQuestion.selector);
    tote.open("", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    // Too few options (1)
    string[] memory oneOpt = new string[](1);
    oneOpt[0] = "Only one";
    vm.expectRevert(Tote.BadOptions.selector);
    tote.open("Q", oneOpt, judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    // Too many options (7)
    string[] memory sevenOpts = new string[](7);
    for (uint256 i = 0; i < 7; i++) sevenOpts[i] = "Opt";
    vm.expectRevert(Tote.BadOptions.selector);
    tote.open("Q", sevenOpts, judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    // Bad judge (address 0 or this contract)
    vm.expectRevert(Tote.BadJudge.selector);
    tote.open("Q", _defaultOptions(), address(0), JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.expectRevert(Tote.BadJudge.selector);
    tote.open("Q", _defaultOptions(), address(tote), JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    // Fee too high (> 500 bps)
    vm.expectRevert(Tote.BadFee.selector);
    tote.open("Q", _defaultOptions(), judge, 501, CLOSE_SECS, DECIDE_SECS);

    // Close time too short (< 1 hours)
    vm.expectRevert(Tote.BadTimes.selector);
    tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, 59 minutes, DECIDE_SECS);

    // Decide time too short (< 1 days)
    vm.expectRevert(Tote.BadTimes.selector);
    tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, 23 hours);
  }

  function test_JudgeCannotBet() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(judge);
    vm.expectRevert(Tote.JudgeCannotBet.selector);
    tote.bet{value: 1 ether}(id, 0);
  }

  function test_BetAfterCloseReverts() public {
    vm.warp(1_000_000);
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.warp(1_000_000 + CLOSE_SECS + 1);

    vm.prank(alice);
    vm.expectRevert(Tote.Closed.selector);
    tote.bet{value: 1 ether}(id, 0);
  }

  function test_BetTooSmall_ArgsMin() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Tote.BetTooSmall.selector, 0.001 ether));
    tote.bet{value: 0.0009 ether}(id, 0);
  }

  function test_TopUpSameOption() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    vm.prank(alice);
    tote.bet{value: 2 ether}(id, 0);

    uint128[] memory s = tote.stakeOf(id, alice);
    assertEq(s[0], 3 ether);
    assertEq(tote.totals(id)[0], 3 ether);
  }

  function test_BackBothSidesThenOneWins() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    // Alice bets 1 on A, 1 on B
    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);
    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 1);

    // Bob bets 2 on B
    vm.prank(bob);
    tote.bet{value: 2 ether}(id, 1);

    // Warp to decide window
    vm.warp(block.timestamp + CLOSE_SECS + 1);

    // Judge calls B
    vm.prank(judge);
    tote.decide(id, 1);

    // Total pot is 4 ether. Winning option B has 3 ether staked (Alice 1, Bob 2).
    // Alice quote: 1/3 of 4 ether = 1.3333... ether
    uint256 qAlice = tote.quoteClaim(id, alice);
    uint256 expected = (uint256(1 ether) * 4 ether) / 3 ether;
    assertEq(qAlice, expected);

    // Alice claims
    vm.prank(alice);
    tote.claim(id);

    // Bob claims (Bob is last winner, gets remaining dust)
    vm.prank(bob);
    tote.claim(id);

    assertEq(tote.pending(alice) + tote.pending(bob), 4 ether);
  }

  function test_DecideSplitsPoolByStake() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    // Alice 2 ether on Team A
    vm.prank(alice);
    tote.bet{value: 2 ether}(id, 0);

    // Bob 3 ether on Team B
    vm.prank(bob);
    tote.bet{value: 3 ether}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + 10);

    vm.prank(judge);
    tote.decide(id, 0);

    // Alice is sole backer of A, claims whole pot (5 ether)
    vm.prank(alice);
    tote.claim(id);

    assertEq(tote.pending(alice), 5 ether);
  }

  function test_LastWinnerGetsDust() public {
    vm.prank(creator);
    // 0 fee to see exact dust handling
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    // 3 backers with 1 wei each on Team A
    // Charlie bets 10 wei on Team B
    address user1 = address(0x6001);
    address user2 = address(0x6002);
    address user3 = address(0x6003);
    vm.deal(user1, 1 ether);
    vm.deal(user2, 1 ether);
    vm.deal(user3, 1 ether);

    vm.prank(user1);
    tote.bet{value: 0.01 ether}(id, 0);
    vm.prank(user2);
    tote.bet{value: 0.01 ether}(id, 0);
    vm.prank(user3);
    tote.bet{value: 0.01 ether}(id, 0);

    // Loser stake
    vm.prank(charlie);
    tote.bet{value: 0.01 ether + 1 wei}(id, 1);

    // Total pot: 0.04 ether + 1 wei (not evenly divisible by 3)
    vm.warp(block.timestamp + CLOSE_SECS + 1);

    vm.prank(judge);
    tote.decide(id, 0);

    vm.prank(user1);
    tote.claim(id);
    vm.prank(user2);
    tote.claim(id);
    vm.prank(user3);
    tote.claim(id);

    uint256 sum = tote.pending(user1) + tote.pending(user2) + tote.pending(user3);
    assertEq(sum, 0.04 ether + 1 wei);
  }

  function test_JudgeFeePaidToPending() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 500, CLOSE_SECS, DECIDE_SECS); // 5%

    vm.prank(alice);
    tote.bet{value: 10 ether}(id, 0);

    vm.warp(block.timestamp + CLOSE_SECS + 1);

    vm.prank(judge);
    tote.decide(id, 0);

    // 5% of 10 ether = 0.5 ether to judge
    assertEq(tote.pending(judge), 0.5 ether);

    uint256 judgeBal = judge.balance;
    vm.prank(judge);
    tote.withdraw();
    assertEq(judge.balance, judgeBal + 0.5 ether);
  }

  function test_DecideOutsideWindowReverts_ArgsWindow() public {
    vm.warp(1_000_000);
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    uint64 closesAt = 1_000_000 + CLOSE_SECS;
    uint64 decideBy = closesAt + DECIDE_SECS;

    // Try decide before close
    vm.prank(judge);
    vm.expectRevert(abi.encodeWithSelector(Tote.NotDeciding.selector, closesAt, decideBy));
    tote.decide(id, 0);

    // Try decide after decideBy
    vm.warp(decideBy + 1);
    vm.prank(judge);
    vm.expectRevert(abi.encodeWithSelector(Tote.NotDeciding.selector, closesAt, decideBy));
    tote.decide(id, 0);
  }

  function test_NoBackersOnWinnerVoidsMarket() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    // Alice bets on Team A
    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    vm.warp(block.timestamp + CLOSE_SECS + 10);

    // Judge decides Team B (which has 0 backers)
    vm.prank(judge);
    tote.decide(id, 1);

    Tote.Market memory m = tote.marketOf(id);
    assertEq(uint8(m.state), uint8(Tote.State.Void));

    // Alice can refund
    vm.prank(alice);
    tote.refund(id);
    assertEq(tote.pending(alice), 1 ether);
  }

  function test_ExpireWhenJudgeSilent() public {
    vm.warp(1_000_000);
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    uint64 decideBy = 1_000_000 + CLOSE_SECS + DECIDE_SECS;

    // Try expire while still deciding
    vm.warp(decideBy - 10);
    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSelector(Tote.StillDeciding.selector, decideBy));
    tote.expire(id);

    // Expire after decideBy
    vm.warp(decideBy + 1);
    vm.prank(bob);
    tote.expire(id);

    Tote.Market memory m = tote.marketOf(id);
    assertEq(uint8(m.state), uint8(Tote.State.Void));

    // Alice refunds
    vm.prank(alice);
    tote.refund(id);
    assertEq(tote.pending(alice), 1 ether);
  }

  function test_RefundReturnsAllStakes() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);
    vm.prank(alice);
    tote.bet{value: 2 ether}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + DECIDE_SECS + 1);
    tote.expire(id);

    vm.prank(alice);
    tote.refund(id);

    assertEq(tote.pending(alice), 3 ether);
  }

  function test_CannotClaimTwice() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);

    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(judge);
    tote.decide(id, 0);

    vm.prank(alice);
    tote.claim(id);

    // Try claim again
    vm.prank(alice);
    vm.expectRevert(Tote.AlreadySettled.selector);
    tote.claim(id);
  }

  function test_LoserHasNothingToClaim() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 1 ether}(id, 0);
    vm.prank(bob);
    tote.bet{value: 1 ether}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(judge);
    tote.decide(id, 0);

    // Bob staked on loser (option 1)
    vm.prank(bob);
    vm.expectRevert(Tote.NothingToClaim.selector);
    tote.claim(id);
  }

  function test_QuoteClaimMatchesFloor() public {
    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 2 ether}(id, 0);
    vm.prank(bob);
    tote.bet{value: 3 ether}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(judge);
    tote.decide(id, 0);

    assertEq(tote.quoteClaim(id, alice), 5 ether);
    assertEq(tote.quoteClaim(id, bob), 0);
  }

  function test_ReentrantWithdrawBlocked() public {
    MaliciousWithdrawer mal = new MaliciousWithdrawer(tote);

    vm.prank(creator);
    uint256 id = tote.open("Q", _defaultOptions(), address(mal), 500, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: 2 ether}(id, 0);

    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(address(mal));
    tote.decide(id, 0);

    // mal has fee in pending
    vm.expectRevert(Tote.TransferFailed.selector);
    mal.attackWithdraw();
  }

  function test_BoundaryMutantKillers() public {
    // 6 options
    string[] memory sixOpts = new string[](6);
    for (uint256 i = 0; i < 6; i++) sixOpts[i] = "O";
    uint256 id = tote.open("Q", sixOpts, judge, 0, CLOSE_SECS, DECIDE_SECS);

    // MIN_BET
    tote.bet{value: tote.MIN_BET()}(id, 0);

    // MAX_JUDGE_BPS
    tote.open("MaxFee", _defaultOptions(), judge, tote.MAX_JUDGE_BPS(), CLOSE_SECS, DECIDE_SECS);

    // Empty withdraw
    vm.expectRevert(Tote.NothingToWithdraw.selector);
    tote.withdraw();

    // latest view
    (uint256[] memory ids, , uint256 total) = tote.latest(0, 10);
    assertEq(total, tote.marketCount());
    assertTrue(ids.length > 0);
  }

  function testFuzz_PayoutsConserveTotal(uint8 b1, uint8 b2, uint8 b3) public {
    uint128 a1 = uint128(bound(b1, 1, 50)) * 0.01 ether;
    uint128 a2 = uint128(bound(b2, 1, 50)) * 0.01 ether;
    uint128 a3 = uint128(bound(b3, 1, 50)) * 0.01 ether;

    vm.prank(creator);
    uint256 id = tote.open("Fuzz", _defaultOptions(), judge, 250, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: a1}(id, 0);
    vm.prank(bob);
    tote.bet{value: a2}(id, 0);
    vm.prank(charlie);
    tote.bet{value: a3}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(judge);
    tote.decide(id, 0);

    vm.prank(alice);
    tote.claim(id);
    vm.prank(bob);
    tote.claim(id);

    uint256 totalStaked = uint256(a1) + a2 + a3;
    uint256 sumPending = tote.pending(judge) + tote.pending(alice) + tote.pending(bob);

    assertEq(sumPending, totalStaked);
  }

  function testFuzz_RefundsConserve(uint8 b1, uint8 b2) public {
    uint128 a1 = uint128(bound(b1, 1, 50)) * 0.01 ether;
    uint128 a2 = uint128(bound(b2, 1, 50)) * 0.01 ether;

    vm.prank(creator);
    uint256 id = tote.open("Fuzz Refund", _defaultOptions(), judge, JUDGE_BPS, CLOSE_SECS, DECIDE_SECS);

    vm.prank(alice);
    tote.bet{value: a1}(id, 0);
    vm.prank(bob);
    tote.bet{value: a2}(id, 1);

    vm.warp(block.timestamp + CLOSE_SECS + DECIDE_SECS + 1);
    tote.expire(id);

    vm.prank(alice);
    tote.refund(id);
    vm.prank(bob);
    tote.refund(id);

    assertEq(tote.pending(alice) + tote.pending(bob), uint256(a1) + a2);
  }

  function test_AdditionalMutantKillers() public {
    // 1. Kill Tote.sol:118 MAX_QUESTION_LEN boundary (exact MAX length succeeds)
    bytes memory maxQ = new bytes(120);
    for (uint256 i = 0; i < 120; i++) maxQ[i] = "a";
    vm.prank(creator);
    uint256 mId = tote.open(string(maxQ), _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);
    assertEq(mId, 1);

    // 2. Kill Tote.sol:325 (uint256 pool = total - fee in quoteClaim)
    vm.prank(alice);
    tote.bet{value: 2 ether}(mId, 0);
    vm.prank(bob);
    tote.bet{value: 2 ether}(mId, 1);

    // With fee 1000 bps (10%), total = 4 ether, fee = 0.4 ether, pool = 3.8 ether
    // Let's create market with fee to test quoteClaim pool computation
    vm.prank(creator);
    uint256 feeId = tote.open("Fee Q", _defaultOptions(), judge, 500, CLOSE_SECS, DECIDE_SECS);
    vm.prank(alice);
    tote.bet{value: 1 ether}(feeId, 0);
    vm.prank(bob);
    tote.bet{value: 3 ether}(feeId, 1);
    vm.warp(block.timestamp + CLOSE_SECS + 1);
    vm.prank(judge);
    tote.decide(feeId, 0);
    // Alice wins: total 4 ether, fee 0.4 ether, pool 3.8 ether. Alice stake is 1 ether, winTotal is 1 ether.
    // quoteClaim should be 3.8 ether. If pool = total + fee, it would be 4.4 ether!
    assertEq(tote.quoteClaim(feeId, alice), 3.8 ether);

    // 3. Kill Tote.sol:175 (block.timestamp == decideBy is allowed to decide)
    vm.prank(creator);
    uint256 dId = tote.open("Decide Exact", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);
    Tote.Market memory dm = tote.marketOf(dId);
    vm.warp(dm.decideBy); // exact boundary
    vm.prank(judge);
    tote.decide(dId, 0);
    assertEq(uint8(tote.marketOf(dId).state), uint8(Tote.State.Void));

    // 4. Kill Tote.sol:203 (expire boundary: at exact decideBy, expire reverts StillDeciding)
    vm.prank(creator);
    uint256 expId = tote.open("Exp Exact", _defaultOptions(), judge, 0, CLOSE_SECS, DECIDE_SECS);
    Tote.Market memory expM = tote.marketOf(expId);
    vm.warp(expM.decideBy);
    vm.expectRevert(abi.encodeWithSelector(Tote.StillDeciding.selector, expM.decideBy));
    tote.expire(expId);

    // 5. Kill Tote.sol:351 & 358 (latest pagination logic)
    // We now have at least 4 markets
    (uint256[] memory ids, Tote.Market[] memory mkts, uint256 total) = tote.latest(1, 2);
    assertEq(ids.length, 2);
    assertEq(ids[0], total - 1);
    assertEq(ids[1], total - 2);

    // offset + count >= total
    (uint256[] memory ids2,,) = tote.latest(total - 1, 5);
    assertEq(ids2.length, 1);
    assertEq(ids2[0], 1);

    // 6. Kill Tote.sol:286 marketOf(marketCount) and marketOf(marketCount + 1)
    tote.marketOf(tote.marketCount());
    uint256 nextId = tote.marketCount() + 1;
    vm.expectRevert(Tote.MarketNotFound.selector);
    tote.marketOf(nextId);
  }

}
