// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Tote — Parimutuel prediction pools with a named judge
/// @notice Back an outcome. The winners split the pot.
contract Tote {
  // --- Constants ---
  uint256 public constant MAX_QUESTION_BYTES = 120;
  uint256 public constant MAX_OPTION_BYTES = 32;
  uint8 public constant MIN_OPTIONS = 2;
  uint8 public constant MAX_OPTIONS = 6;
  uint128 public constant MIN_BET = 0.001 ether;
  uint16 public constant MAX_JUDGE_BPS = 500; // 5%
  uint64 public constant MIN_CLOSE = 1 hours;
  uint64 public constant MAX_CLOSE = 90 days;
  uint64 public constant MIN_DECIDE = 1 days;
  uint64 public constant MAX_DECIDE = 30 days;
  uint256 public constant MAX_PAGE = 50;

  enum State {
    Open,
    Decided,
    Void
  }

  struct Market {
    address creator;
    address judge;
    uint64 closesAt;
    uint64 decideBy;
    uint16 judgeBps;
    uint8 optionCount;
    uint8 winner; // 255 = none
    State state;
    uint128 total;
    uint128 credited;
    uint128 paidOut;
    uint128 claimedStake;
    string question;
  }

  // --- State ---
  mapping(uint256 => Market) private _markets;
  mapping(uint256 => string[]) private _options;
  mapping(uint256 => uint128[6]) private _optionTotal;
  mapping(uint256 => mapping(uint8 => mapping(address => uint128))) private _stake;
  mapping(uint256 => mapping(address => bool)) private _settled;
  mapping(address => uint256) public pending;
  uint256 public marketCount;

  uint256 private _locked;

  // --- Events ---
  event Opened(
    uint256 indexed id,
    address indexed creator,
    string question,
    address indexed judge,
    uint16 judgeBps,
    uint64 closesAt,
    uint64 decideBy
  );
  event Bet(
    uint256 indexed id,
    address indexed who,
    uint8 indexed option,
    uint256 amount,
    uint256 optionTotal,
    uint256 total
  );
  event Decided(uint256 indexed id, uint8 indexed option, uint256 fee, uint256 pool);
  event Voided(uint256 indexed id, string reason);
  event Claimed(uint256 indexed id, address indexed who, uint256 stake, uint256 payout);
  event Refunded(uint256 indexed id, address indexed who, uint256 amount);
  event Withdrawn(address indexed to, uint256 amount);

  // --- Errors ---
  error BadQuestion();
  error BadOptions();
  error BadJudge();
  error BadFee();
  error BadTimes();
  error MarketNotFound();
  error Closed();
  error BadOption();
  error JudgeCannotBet();
  error BetTooSmall(uint256 min);
  error NotJudge();
  error NotDeciding(uint64 closesAt, uint64 decideBy);
  error StillDeciding(uint64 decideBy);
  error MarketNotDecided();
  error MarketNotVoid();
  error NothingToClaim();
  error AlreadySettled();
  error NothingToWithdraw();
  error TransferFailed();
  error ReentrancyGuard();

  // --- Modifiers ---
  modifier nonReentrant() {
    if (_locked == 1) revert ReentrancyGuard();
    _locked = 1;
    _;
    _locked = 0;
  }

  // --- Core Functions ---

  /// @notice Open a new parimutuel market
  function open(
    string calldata question,
    string[] calldata options,
    address judge,
    uint16 judgeBps,
    uint64 closeSecs,
    uint64 decideSecs
  ) external returns (uint256 id) {
    if (bytes(question).length == 0 || bytes(question).length > MAX_QUESTION_BYTES) {
      revert BadQuestion();
    }
    uint256 optLen = options.length;
    if (optLen < MIN_OPTIONS || optLen > MAX_OPTIONS) revert BadOptions();
    for (uint256 i = 0; i < optLen; i++) {
      if (bytes(options[i]).length == 0 || bytes(options[i]).length > MAX_OPTION_BYTES) {
        revert BadOptions();
      }
    }
    if (judge == address(0) || judge == address(this)) revert BadJudge();
    if (judgeBps > MAX_JUDGE_BPS) revert BadFee();
    if (closeSecs < MIN_CLOSE || closeSecs > MAX_CLOSE) revert BadTimes();
    if (decideSecs < MIN_DECIDE || decideSecs > MAX_DECIDE) revert BadTimes();

    id = ++marketCount;
    Market storage m = _markets[id];
    m.creator = msg.sender;
    m.judge = judge;
    m.closesAt = uint64(block.timestamp + closeSecs);
    m.decideBy = uint64(m.closesAt + decideSecs);
    m.judgeBps = judgeBps;
    m.optionCount = uint8(optLen);
    m.winner = 255;
    m.state = State.Open;
    m.question = question;

    for (uint256 i = 0; i < optLen; i++) {
      _options[id].push(options[i]);
    }

    emit Opened(id, msg.sender, question, judge, judgeBps, m.closesAt, m.decideBy);
  }

  /// @notice Back an outcome with BOT
  function bet(uint256 id, uint8 option) external payable {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (m.state != State.Open || block.timestamp >= m.closesAt) revert Closed();
    if (option >= m.optionCount) revert BadOption();
    if (msg.sender == m.judge) revert JudgeCannotBet();
    if (msg.value < MIN_BET) revert BetTooSmall(MIN_BET);

    uint128 val = uint128(msg.value);
    _stake[id][option][msg.sender] += val;
    _optionTotal[id][option] += val;
    m.total += val;

    emit Bet(id, msg.sender, option, msg.value, _optionTotal[id][option], m.total);
  }

  /// @notice Judge decides the winning outcome
  function decide(uint256 id, uint8 option) external {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (msg.sender != m.judge) revert NotJudge();
    if (m.state != State.Open) revert Closed();
    if (block.timestamp < m.closesAt || block.timestamp > m.decideBy) {
      revert NotDeciding(m.closesAt, m.decideBy);
    }
    if (option >= m.optionCount) revert BadOption();

    if (_optionTotal[id][option] == 0) {
      m.state = State.Void;
      emit Voided(id, "no backers");
      return;
    }

    uint256 total = m.total;
    uint256 fee = (total * m.judgeBps) / 10000;
    uint256 pool = total - fee;

    pending[m.judge] += fee;
    m.credited += uint128(fee);
    m.winner = option;
    m.state = State.Decided;

    emit Decided(id, option, fee, pool);
  }

  /// @notice Anyone can expire and void a market if the judge is silent past the deadline
  function expire(uint256 id) external {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (m.state != State.Open) revert Closed();
    if (block.timestamp <= m.decideBy) revert StillDeciding(m.decideBy);

    m.state = State.Void;
    emit Voided(id, "judge silent");
  }

  /// @notice Claim share of the pool for a winning stake
  function claim(uint256 id) external {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (m.state != State.Decided) revert MarketNotDecided();
    if (_settled[id][msg.sender]) revert AlreadySettled();

    uint8 winOpt = m.winner;
    uint128 userStake = _stake[id][winOpt][msg.sender];
    if (userStake == 0) revert NothingToClaim();

    _settled[id][msg.sender] = true;

    uint256 total = m.total;
    uint256 fee = (total * m.judgeBps) / 10000;
    uint256 pool = total - fee;
    uint128 winTotal = _optionTotal[id][winOpt];

    uint256 payout;
    // Last winner gets remaining dust (§2.2):
    // if claimedStake + userStake == optionTotal[winner] then payout = pool - paidOut
    if (m.claimedStake + userStake == winTotal) {
      payout = pool - m.paidOut;
    } else {
      payout = (uint256(userStake) * pool) / winTotal;
    }

    m.claimedStake += userStake;
    m.paidOut += uint128(payout);
    m.credited += uint128(payout);
    pending[msg.sender] += payout;

    emit Claimed(id, msg.sender, userStake, payout);
  }

  /// @notice Refund stakes if market is voided
  function refund(uint256 id) external {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (m.state != State.Void) revert MarketNotVoid();
    if (_settled[id][msg.sender]) revert AlreadySettled();

    uint256 refundAmount = 0;
    for (uint8 i = 0; i < m.optionCount; i++) {
      refundAmount += _stake[id][i][msg.sender];
    }
    if (refundAmount == 0) revert NothingToClaim();

    _settled[id][msg.sender] = true;
    m.credited += uint128(refundAmount);
    pending[msg.sender] += refundAmount;

    emit Refunded(id, msg.sender, refundAmount);
  }

  /// @notice Withdraw accumulated pending funds
  function withdraw() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amount);
  }

  // --- Views ---

  /// @notice Retrieve market details
  function marketOf(uint256 id) external view returns (Market memory) {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    return _markets[id];
  }

  /// @notice Retrieve options for a market
  function optionsOf(uint256 id) external view returns (string[] memory) {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    return _options[id];
  }

  /// @notice Retrieve totals staked per option
  function totals(uint256 id) external view returns (uint256[] memory) {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    uint8 count = _markets[id].optionCount;
    uint256[] memory res = new uint256[](count);
    for (uint8 i = 0; i < count; i++) {
      res[i] = _optionTotal[id][i];
    }
    return res;
  }

  /// @notice Retrieve caller's stakes per option
  function stakeOf(uint256 id, address who) external view returns (uint128[] memory) {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    uint8 count = _markets[id].optionCount;
    uint128[] memory res = new uint128[](count);
    for (uint8 i = 0; i < count; i++) {
      res[i] = _stake[id][i][who];
    }
    return res;
  }

  /// @notice Quote expected claim payout (floor payout now)
  function quoteClaim(uint256 id, address who) external view returns (uint256) {
    if (id == 0 || id > marketCount) revert MarketNotFound();
    Market storage m = _markets[id];
    if (m.state != State.Decided) return 0;
    if (_settled[id][who]) return 0;

    uint8 winOpt = m.winner;
    uint128 s = _stake[id][winOpt][who];
    if (s == 0) return 0;

    uint256 total = m.total;
    uint256 fee = (total * m.judgeBps) / 10000;
    uint256 pool = total - fee;
    uint128 winTotal = _optionTotal[id][winOpt];
    if (winTotal == 0) return 0;

    if (m.claimedStake + s == winTotal) {
      return pool - m.paidOut;
    }
    return (uint256(s) * pool) / winTotal;
  }

  /// @notice Retrieve latest markets
  function latest(uint256 offset, uint256 count)
    external
    view
    returns (uint256[] memory ids, Market[] memory markets, uint256 total)
  {
    total = marketCount;
    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }

    if (offset >= total || count == 0) {
      return (new uint256[](0), new Market[](0), total);
    }

    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    markets = new Market[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 id = total - (offset + i);
      ids[i] = id;
      markets[i] = _markets[id];
    }
  }
}
