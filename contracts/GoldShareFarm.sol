// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IGoldShareMintable {
    function mint(address to, uint256 amount) external;
}

/**
 * @title GoldShareFarm
 * @notice MasterChef-style farm distributing GSHARE per second to LP stakers.
 * @dev Standard Sushi/Pancake/Tomb pattern: per-second emissions, per-pool accumulator.
 *      - 20-year emission schedule for 316,750 GSHARE base
 *      - Hot start: +2,500 GSHARE distributed in first 30 days
 *      - Total max emission: 319,250 GSHARE (hardcoded)
 *      - Multi-pool with allocation points
 */
contract GoldShareFarm is Ownable {
    using SafeERC20 for IERC20;

    // ============= CONSTANTS =============

    uint256 public constant PRECISION = 1e12;
    uint256 public constant SECONDS_PER_YEAR = 31_536_000; // 365 * 24 * 3600
    uint256 public constant HOT_START_DURATION = 30 days;
    uint256 public constant HOT_START_BONUS = 2_500 ether;
    uint256 public constant TOTAL_BASE_EMISSION = 316_750 ether;
    uint256 public constant MAX_EMISSION = TOTAL_BASE_EMISSION + HOT_START_BONUS; // 319,250

    /// @notice Year-by-year emission of GSHARE base schedule (year 1 to 20)
    /// Sums to exactly 316,750 GSHARE
    uint256[20] public yearlyEmission = [
        47_500 ether,  // Year 1
        38_000 ether,  // Year 2
        31_750 ether,  // Year 3
        25_750 ether,  // Year 4
        22_500 ether,  // Year 5
        19_250 ether,  // Year 6
        16_000 ether,  // Year 7
        13_000 ether,  // Year 8
        11_250 ether,  // Year 9
        10_000 ether,  // Year 10
        9_250 ether,   // Year 11
        8_750 ether,   // Year 12
        8_250 ether,   // Year 13
        7_750 ether,   // Year 14
        7_250 ether,   // Year 15
        8_100 ether,   // Year 16
        8_100 ether,   // Year 17
        8_100 ether,   // Year 18
        8_100 ether,   // Year 19
        8_100 ether    // Year 20
    ];

    // ============= STATE =============

    IGoldShareMintable public immutable gshare;
    uint256 public immutable startTimestamp;

    /// @notice Total GSHARE distributed so far (incl. hot start bonus)
    uint256 public totalEmitted;

    struct PoolInfo {
        IERC20 lpToken;
        uint256 allocPoint;
        uint256 lastRewardTimestamp;
        uint256 accGsharePerShare; // scaled by PRECISION (1e12)
        uint256 totalStaked;
    }

    struct UserInfo {
        uint256 amount;      // LP staked
        uint256 rewardDebt;  // for accumulator math
    }

    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    uint256 public totalAllocPoint;

    /// @notice Prevent the same LP token being added twice
    mapping(address => bool) public lpTokenAdded;

    // ============= EVENTS =============

    event PoolAdded(uint256 indexed pid, address indexed lpToken, uint256 allocPoint);
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    // ============= ERRORS =============

    error LpAlreadyAdded();
    error InvalidPid();
    error InsufficientBalance();
    error EmissionCapped();

    // ============= CONSTRUCTOR =============

    constructor(address _gshare, uint256 _startTimestamp) Ownable(msg.sender) {
        gshare = IGoldShareMintable(_gshare);
        startTimestamp = _startTimestamp;
    }

    // ============= POOL MANAGEMENT =============

    function addPool(IERC20 _lpToken, uint256 _allocPoint) external onlyOwner {
        if (lpTokenAdded[address(_lpToken)]) revert LpAlreadyAdded();
        massUpdatePools();

        uint256 lastRewardTime = block.timestamp > startTimestamp ? block.timestamp : startTimestamp;
        totalAllocPoint += _allocPoint;
        lpTokenAdded[address(_lpToken)] = true;

        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardTimestamp: lastRewardTime,
            accGsharePerShare: 0,
            totalStaked: 0
        }));

        emit PoolAdded(poolInfo.length - 1, address(_lpToken), _allocPoint);
    }

    function setPool(uint256 _pid, uint256 _allocPoint) external onlyOwner {
        if (_pid >= poolInfo.length) revert InvalidPid();
        massUpdatePools();

        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;

        emit PoolUpdated(_pid, _allocPoint);
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // ============= EMISSION RATE =============

    /// @notice Returns the global GSHARE emission rate per second at given timestamp
    /// @dev Combines year-based schedule + hot start bonus if applicable
    function emissionPerSecond(uint256 timestamp) public view returns (uint256) {
        if (timestamp < startTimestamp) return 0;

        uint256 yearIdx = (timestamp - startTimestamp) / SECONDS_PER_YEAR;
        if (yearIdx >= 20) return 0; // emission stops after year 20

        uint256 baseRate = yearlyEmission[yearIdx] / SECONDS_PER_YEAR;

        // Hot start bonus active in first 30 days
        if (timestamp < startTimestamp + HOT_START_DURATION) {
            uint256 hotRate = HOT_START_BONUS / HOT_START_DURATION;
            return baseRate + hotRate;
        }

        return baseRate;
    }

    /// @notice Total GSHARE emission accrued between two timestamps (global, all pools)
    /// @dev Handles year transitions and hot-start period correctly
    function _emissionBetween(uint256 from, uint256 to) internal view returns (uint256) {
        if (to <= from || from < startTimestamp) {
            if (from < startTimestamp) from = startTimestamp;
            if (to <= from) return 0;
        }

        uint256 totalYears = 20;
        uint256 emissionTotal = 0;
        uint256 cursor = from;

        while (cursor < to) {
            uint256 yearIdx = (cursor - startTimestamp) / SECONDS_PER_YEAR;
            if (yearIdx >= totalYears) break;

            // Boundary of next event: end of current year OR end of hot start
            uint256 yearEnd = startTimestamp + (yearIdx + 1) * SECONDS_PER_YEAR;
            uint256 hotEnd = startTimestamp + HOT_START_DURATION;

            uint256 nextBoundary = yearEnd < to ? yearEnd : to;
            // If hot start ends within this segment, split there
            if (cursor < hotEnd && hotEnd < nextBoundary) {
                nextBoundary = hotEnd;
            }

            uint256 segmentDuration = nextBoundary - cursor;
            uint256 rateAtCursor = emissionPerSecond(cursor);
            emissionTotal += segmentDuration * rateAtCursor;

            cursor = nextBoundary;
        }

        return emissionTotal;
    }

    // ============= ACCUMULATOR UPDATE =============

    function updatePool(uint256 _pid) public {
        if (_pid >= poolInfo.length) revert InvalidPid();
        PoolInfo storage pool = poolInfo[_pid];

        if (block.timestamp <= pool.lastRewardTimestamp) return;
        if (pool.totalStaked == 0 || pool.allocPoint == 0 || totalAllocPoint == 0) {
            pool.lastRewardTimestamp = block.timestamp;
            return;
        }
        if (totalEmitted >= MAX_EMISSION) {
            pool.lastRewardTimestamp = block.timestamp;
            return;
        }

        uint256 globalEmission = _emissionBetween(pool.lastRewardTimestamp, block.timestamp);
        uint256 poolReward = (globalEmission * pool.allocPoint) / totalAllocPoint;

        // Cap at remaining emission budget
        uint256 remaining = MAX_EMISSION - totalEmitted;
        if (poolReward > remaining) poolReward = remaining;

        if (poolReward > 0) {
            // Mint GSHARE to this contract for distribution
            gshare.mint(address(this), poolReward);
            totalEmitted += poolReward;

            pool.accGsharePerShare += (poolReward * PRECISION) / pool.totalStaked;
        }

        pool.lastRewardTimestamp = block.timestamp;
    }

    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; pid++) {
            updatePool(pid);
        }
    }

    // ============= VIEW =============

    function pendingGshare(uint256 _pid, address _user) external view returns (uint256) {
        if (_pid >= poolInfo.length) return 0;
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo memory user = userInfo[_pid][_user];

        uint256 acc = pool.accGsharePerShare;
        if (
            block.timestamp > pool.lastRewardTimestamp &&
            pool.totalStaked > 0 &&
            pool.allocPoint > 0 &&
            totalAllocPoint > 0 &&
            totalEmitted < MAX_EMISSION
        ) {
            uint256 globalEmission = _emissionBetween(pool.lastRewardTimestamp, block.timestamp);
            uint256 poolReward = (globalEmission * pool.allocPoint) / totalAllocPoint;
            uint256 remaining = MAX_EMISSION - totalEmitted;
            if (poolReward > remaining) poolReward = remaining;
            acc += (poolReward * PRECISION) / pool.totalStaked;
        }

        uint256 gross = (user.amount * acc) / PRECISION;
        if (gross < user.rewardDebt) return 0;
        return gross - user.rewardDebt;
    }

    // ============= USER ACTIONS =============

    function deposit(uint256 _pid, uint256 _amount) external {
        if (_pid >= poolInfo.length) revert InvalidPid();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        // Auto-harvest existing rewards before changing position
        if (user.amount > 0) {
            uint256 pending = (user.amount * pool.accGsharePerShare) / PRECISION - user.rewardDebt;
            if (pending > 0) {
                IERC20(address(gshare)).safeTransfer(msg.sender, pending);
                emit Harvest(msg.sender, _pid, pending);
            }
        }

        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
            user.amount += _amount;
            pool.totalStaked += _amount;
        }

        user.rewardDebt = (user.amount * pool.accGsharePerShare) / PRECISION;
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) external {
        if (_pid >= poolInfo.length) revert InvalidPid();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        if (user.amount < _amount) revert InsufficientBalance();

        updatePool(_pid);

        // Auto-harvest before withdrawing
        uint256 pending = (user.amount * pool.accGsharePerShare) / PRECISION - user.rewardDebt;
        if (pending > 0) {
            IERC20(address(gshare)).safeTransfer(msg.sender, pending);
            emit Harvest(msg.sender, _pid, pending);
        }

        if (_amount > 0) {
            user.amount -= _amount;
            pool.totalStaked -= _amount;
            pool.lpToken.safeTransfer(msg.sender, _amount);
        }

        user.rewardDebt = (user.amount * pool.accGsharePerShare) / PRECISION;
        emit Withdraw(msg.sender, _pid, _amount);
    }

    function harvest(uint256 _pid) external {
        if (_pid >= poolInfo.length) revert InvalidPid();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        uint256 pending = (user.amount * pool.accGsharePerShare) / PRECISION - user.rewardDebt;
        if (pending > 0) {
            IERC20(address(gshare)).safeTransfer(msg.sender, pending);
            emit Harvest(msg.sender, _pid, pending);
        }

        user.rewardDebt = (user.amount * pool.accGsharePerShare) / PRECISION;
    }

    /// @notice Withdraw without rewards in emergency. Forfeits pending GSHARE.
    function emergencyWithdraw(uint256 _pid) external {
        if (_pid >= poolInfo.length) revert InvalidPid();
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        pool.totalStaked -= amount;

        if (amount > 0) {
            pool.lpToken.safeTransfer(msg.sender, amount);
        }
        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }
}