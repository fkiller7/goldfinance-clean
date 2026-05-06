// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGoldShare {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IGoldCoinMintable {
    function mint(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Boardroom v2
 * @notice Stake GSHARE, earn GOLD per epoch (6 hours)
 * @dev - Real accumulator logic (accRewardPerShare pattern)
 *      - Adjustable epochReward (target 2000% APR at launch prices)
 *      - 12-hour withdraw lock after deposit
 *      - GOLD is minted on claim (boardroom must be a GOLD minter)
 *      - BuybackController can inject extra rewards via injectReward()
 */
contract Boardroom is Ownable, ReentrancyGuard {
    IGoldShare public immutable gshare;
    IGoldCoinMintable public immutable gold;

    uint256 public constant EPOCH_DURATION = 6 hours;
    uint256 public constant WITHDRAW_LOCK = 12 hours;
    uint256 public constant PRECISION = 1e18;

    /// @notice Hard safety cap on rewards (prevents owner abuse)
    /// @dev = 1 GOLD per GSHARE per epoch (~30,000% APR at launch prices)
    uint256 public constant MAX_REWARD_PER_EPOCH_PER_SHARE = 100e18;

    /// @notice Reward minted per GSHARE per epoch (in wei)
    /// @dev At launch: 0.0685 GOLD per GSHARE per epoch = 2000% APR @ $5/$0.001
    uint256 public rewardPerEpochPerShare;

    /// @notice Accumulator: total reward per share (1e18 precision)
    uint256 public accRewardPerShare;

    /// @notice Last epoch index when accumulator was updated
    uint256 public lastEpochUpdated;

    /// @notice Epoch timing
    uint256 public immutable epochStart;
    uint256 public currentEpoch;

    /// @notice Total GSHARE staked across all users
    uint256 public totalStaked;

    struct UserInfo {
        uint256 staked;              // Amount of GSHARE staked
        uint256 rewardDebt;          // Accumulator snapshot at last interaction
        uint256 nextWithdrawAllowed; // Timestamp when withdraw is unlocked
    }
    mapping(address => UserInfo) public users;

    /// @notice Authorized to inject extra rewards (BuybackController)
    address public rewardInjector;

    /// @notice Cumulative rewards injected from buyback (for transparency)
    uint256 public totalInjectedRewards;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event Claim(address indexed user, uint256 amount);
    event EpochAdvanced(uint256 indexed epoch, uint256 rewardPerShare);
    event RewardPerEpochSet(uint256 newReward);
    event RewardInjected(address indexed injector, uint256 amount);
    event RewardInjectorSet(address indexed injector);

    error TooHigh();
    error ZeroAmount();
    error NotEnoughStaked();
    error WithdrawLocked();
    error ZeroAddress();
    error NotInjector();

    constructor(
        address admin,
        address _gshare,
        address _gold,
        uint256 _epochStart,
        uint256 _initialRewardPerEpoch
    ) Ownable(admin) {
        if (admin == address(0) || _gshare == address(0) || _gold == address(0)) {
            revert ZeroAddress();
        }
        if (_initialRewardPerEpoch > MAX_REWARD_PER_EPOCH_PER_SHARE) revert TooHigh();

        gshare = IGoldShare(_gshare);
        gold = IGoldCoinMintable(_gold);
        epochStart = _epochStart;
        rewardPerEpochPerShare = _initialRewardPerEpoch;
        lastEpochUpdated = 0;
        currentEpoch = 0;
    }

    // ============= EPOCH MANAGEMENT =============

    /// @notice How many full epochs have passed since start
    function _epochsPassed() internal view returns (uint256) {
        if (block.timestamp < epochStart) return 0;
        return (block.timestamp - epochStart) / EPOCH_DURATION;
    }

    /// @notice Advance the accumulator by all unprocessed epochs
    /// @dev Called before any user interaction to keep state fresh
    function _updateAccumulator() internal {
        uint256 epochsNow = _epochsPassed();
        uint256 epochsToProcess = epochsNow - lastEpochUpdated;

        if (epochsToProcess > 0 && totalStaked > 0) {
            // accRewardPerShare gets += (rewardPerEpoch / totalStaked) per epoch passed
            uint256 rewardPerShareThisPeriod =
                (rewardPerEpochPerShare * epochsToProcess * PRECISION) / PRECISION;
            accRewardPerShare += rewardPerShareThisPeriod;

            currentEpoch = epochsNow;
            emit EpochAdvanced(currentEpoch, accRewardPerShare);
        }

        lastEpochUpdated = epochsNow;
        currentEpoch = epochsNow;
    }

    // ============= VIEW FUNCTIONS =============

    /// @notice Pending GOLD rewards for a user (without modifying state)
    function pendingReward(address user) public view returns (uint256) {
        UserInfo memory u = users[user];
        if (u.staked == 0) return 0;

        uint256 accNow = accRewardPerShare;
        uint256 epochsNow = _epochsPassed();
        uint256 epochsToProcess = epochsNow - lastEpochUpdated;

        if (epochsToProcess > 0 && totalStaked > 0) {
            accNow += rewardPerEpochPerShare * epochsToProcess;
        }

        // pending = staked × accRewardPerShare - rewardDebt
        uint256 grossReward = (u.staked * accNow) / PRECISION;
        if (grossReward < u.rewardDebt) return 0;
        return grossReward - u.rewardDebt;
    }

    /// @notice When does the next epoch tick? (timestamp)
    function nextEpochTimestamp() external view returns (uint256) {
        uint256 epochsNow = _epochsPassed();
        return epochStart + (epochsNow + 1) * EPOCH_DURATION;
    }

    /// @notice Display-only: current effective rewards-per-share total
    function viewAccRewardPerShare() external view returns (uint256) {
        uint256 accNow = accRewardPerShare;
        uint256 epochsNow = _epochsPassed();
        uint256 epochsToProcess = epochsNow - lastEpochUpdated;
        if (epochsToProcess > 0 && totalStaked > 0) {
            accNow += rewardPerEpochPerShare * epochsToProcess;
        }
        return accNow;
    }

    // ============= USER ACTIONS =============

    /// @notice Stake GSHARE (also claims pending rewards)
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updateAccumulator();

        UserInfo storage u = users[msg.sender];

        // Pay out pending first
        if (u.staked > 0) {
            uint256 pending = (u.staked * accRewardPerShare) / PRECISION - u.rewardDebt;
            if (pending > 0) {
                gold.mint(msg.sender, pending);
                emit Claim(msg.sender, pending);
            }
        }

        // Pull GSHARE from user
        gshare.transferFrom(msg.sender, address(this), amount);

        u.staked += amount;
        u.nextWithdrawAllowed = block.timestamp + WITHDRAW_LOCK;
        totalStaked += amount;

        // Update reward debt to current accumulator
        u.rewardDebt = (u.staked * accRewardPerShare) / PRECISION;

        emit Deposit(msg.sender, amount);
    }

    /// @notice Withdraw GSHARE (also claims pending rewards)
    function withdraw(uint256 amount) external nonReentrant {
        UserInfo storage u = users[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (u.staked < amount) revert NotEnoughStaked();
        if (block.timestamp < u.nextWithdrawAllowed) revert WithdrawLocked();

        _updateAccumulator();

        // Pay out pending first
        uint256 pending = (u.staked * accRewardPerShare) / PRECISION - u.rewardDebt;
        if (pending > 0) {
            gold.mint(msg.sender, pending);
            emit Claim(msg.sender, pending);
        }

        u.staked -= amount;
        totalStaked -= amount;

        gshare.transfer(msg.sender, amount);

        // Update reward debt
        u.rewardDebt = (u.staked * accRewardPerShare) / PRECISION;

        emit Withdraw(msg.sender, amount);
    }

    /// @notice Claim pending GOLD without modifying stake
    function claim() external nonReentrant {
        _updateAccumulator();

        UserInfo storage u = users[msg.sender];
        if (u.staked == 0) revert ZeroAmount();

        uint256 pending = (u.staked * accRewardPerShare) / PRECISION - u.rewardDebt;
        if (pending == 0) revert ZeroAmount();

        gold.mint(msg.sender, pending);
        u.rewardDebt = (u.staked * accRewardPerShare) / PRECISION;

        emit Claim(msg.sender, pending);
    }

    // ============= REWARD INJECTION (BUYBACK) =============

    /// @notice BuybackController can inject already-held GOLD as extra reward
    /// @dev This GOLD is already in this contract (transferred by injector)
    /// @dev Increases accRewardPerShare for all current stakers
    function injectReward(uint256 amount) external nonReentrant {
        if (msg.sender != rewardInjector) revert NotInjector();
        if (amount == 0) revert ZeroAmount();
        if (totalStaked == 0) revert ZeroAmount(); // no one to reward

        _updateAccumulator();
        accRewardPerShare += (amount * PRECISION) / totalStaked;
        totalInjectedRewards += amount;

        emit RewardInjected(msg.sender, amount);
    }

    // ============= ADMIN =============

    /// @notice Update reward emission per epoch (with safety cap)
    function setRewardPerEpochPerShare(uint256 newReward) external onlyOwner {
        if (newReward > MAX_REWARD_PER_EPOCH_PER_SHARE) revert TooHigh();
        _updateAccumulator(); // settle old rate first
        rewardPerEpochPerShare = newReward;
        emit RewardPerEpochSet(newReward);
    }

    /// @notice Set the BuybackController address
    function setRewardInjector(address injector) external onlyOwner {
        if (injector == address(0)) revert ZeroAddress();
        rewardInjector = injector;
        emit RewardInjectorSet(injector);
    }

    /// @notice Force epoch update (anyone can call for transparency)
    function poke() external {
        _updateAccumulator();
    }
}
