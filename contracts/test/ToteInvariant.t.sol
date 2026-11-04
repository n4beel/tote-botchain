// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Tote} from "../src/Tote.sol";

contract ToteHandler is Test {
  Tote public tote;
  address[] public bettors;
  address public judge = address(0x9999);
  uint256 public heldInMarkets;
  uint256 public sumPending;

  constructor(Tote _tote) {
    tote = _tote;
    bettors.push(address(0x1111));
    bettors.push(address(0x2222));
    bettors.push(address(0x3333));

    for (uint256 i = 0; i < bettors.length; i++) {
      vm.deal(bettors[i], 1_000 ether);
    }
    vm.deal(judge, 100 ether);

    // Initial market
    string[] memory opts = new string[](2);
    opts[0] = "Yes";
    opts[1] = "No";
    tote.open("Handler Market", opts, judge, 200, 1 days, 2 days);
  }

  function bet(uint8 bIdx, uint256 mId, uint8 opt, uint128 amt) external {
    uint256 count = tote.marketCount();
    if (count == 0) return;
    mId = (mId % count) + 1;
    address b = bettors[bIdx % bettors.length];
    opt = opt % 2;
    amt = uint128(bound(amt, tote.MIN_BET(), 5 ether));

    vm.prank(b);
    try tote.bet{value: amt}(mId, opt) {
      heldInMarkets += amt;
    } catch {}
  }

  function decide(uint256 mId, uint8 opt) external {
    uint256 count = tote.marketCount();
    if (count == 0) return;
    mId = (mId % count) + 1;
    opt = opt % 2;

    vm.prank(judge);
    try tote.decide(mId, opt) {
      Tote.Market memory m = tote.marketOf(mId);
      uint256 fee = (uint256(m.total) * m.judgeBps) / 10000;
      heldInMarkets -= fee;
      sumPending += fee;
    } catch {}
  }

  function claim(uint8 bIdx, uint256 mId) external {
    uint256 count = tote.marketCount();
    if (count == 0) return;
    mId = (mId % count) + 1;
    address b = bettors[bIdx % bettors.length];

    uint256 q = tote.quoteClaim(mId, b);
    if (q > 0) {
      vm.prank(b);
      try tote.claim(mId) {
        heldInMarkets -= q;
        sumPending += q;
      } catch {}
    }
  }

  function withdraw(uint8 bIdx) external {
    address b = bettors[bIdx % bettors.length];
    uint256 p = tote.pending(b);
    if (p > 0) {
      vm.prank(b);
      try tote.withdraw() {
        sumPending -= p;
      } catch {}
    }
  }

  function warp(uint32 secs) external {
    secs = uint32(bound(secs, 1 hours, 5 days));
    vm.warp(block.timestamp + secs);
  }
}

contract ToteInvariantTest is Test {
  Tote public tote;
  ToteHandler public handler;

  function setUp() public {
    tote = new Tote();
    handler = new ToteHandler(tote);
    targetContract(address(handler));
  }

  function invariant_BalanceEqualsHeldPlusPending() public view {
    // Invariant from Spec §2.3: balance == Σ (total - credited) + Σ pending
    assertEq(address(tote).balance, handler.heldInMarkets() + handler.sumPending());
  }
}
