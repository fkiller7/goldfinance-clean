// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IGoldCoin {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

interface IBoardroom {
    function injectReward(uint256 amount) external;
}

/**
 * @title BuybackController
 * @notice Receives GOLD sell tax, splits 50% burn / 50% to Boardroom rewards
 * @dev - Tax flows here automatically from GoldCoin._update() hook
 *      - Owner calls executeBuyback() to process accumulated tax
 */
contract BuybackController is Ownable {
    IGoldCoin public immutable gold;
    IBoardroom public boardroom;

    /// @notice Total GOLD burnt to date (transparency)
    uint256 public totalBurnt;

    /// @notice Total GOLD injected to boardroom rewards (transparency)
    uint256 public totalRewarded;

    event BoardroomSet(address indexed boardroom);
    event BuybackExecuted(uint256 burnt, uint256 rewarded);

    error ZeroAddress();
    error ZeroBalance();
    error BoardroomNotSet();

    constructor(address admin, address _gold) Ownable(admin) {
        if (admin == address(0) || _gold == address(0)) revert ZeroAddress();
        gold = IGoldCoin(_gold);
    }

    /// @notice Set the Boardroom contract address
    function setBoardroom(address _boardroom) external onlyOwner {
        if (_boardroom == address(0)) revert ZeroAddress();
        boardroom = IBoardroom(_boardroom);
        emit BoardroomSet(_boardroom);
    }

    /// @notice Process all accumulated tax: 50% burn, 50% to boardroom
    /// @dev Anyone can call (incentive could be added later)
    function executeBuyback() external {
        if (address(boardroom) == address(0)) revert BoardroomNotSet();
        uint256 balance = gold.balanceOf(address(this));
        if (balance == 0) revert ZeroBalance();

        uint256 toBurn = balance / 2;
        uint256 toReward = balance - toBurn; // handles odd amounts

        // 1. Burn 50%
        gold.burn(toBurn);
        totalBurnt += toBurn;

        // 2. Transfer 50% to boardroom and notify
        gold.transfer(address(boardroom), toReward);
        boardroom.injectReward(toReward);
        totalRewarded += toReward;

        emit BuybackExecuted(toBurn, toReward);
    }

    /// @notice View current accumulated tax pending buyback
    function pendingBuyback() external view returns (uint256) {
        return gold.balanceOf(address(this));
    }
}