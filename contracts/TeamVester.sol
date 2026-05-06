// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TeamVester
 * @notice Linear vesting of team's GSHARE allocation over 2 years
 * @dev - 26,250 GSHARE total
 *      - 2-year linear release (= 12.5 GSHARE/hour, ~36 GSHARE/epoch)
 *      - Claimable by `beneficiary` at any time
 *      - Vesting starts at deploy time
 */
contract TeamVester is Ownable {
    IERC20 public immutable gshare;

    uint256 public constant TOTAL_ALLOCATION = 26_250 * 1e18;
    uint256 public constant VESTING_DURATION = 730 days; // 2 years

    uint256 public immutable startTimestamp;

    /// @notice Wallet that can claim vested tokens
    address public beneficiary;

    /// @notice Total claimed so far
    uint256 public claimed;

    event Claimed(address indexed beneficiary, uint256 amount);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);

    error NothingToClaim();
    error NotBeneficiary();
    error ZeroAddress();

    constructor(address admin, address _gshare, address _beneficiary) Ownable(admin) {
        if (admin == address(0) || _gshare == address(0) || _beneficiary == address(0)) {
            revert ZeroAddress();
        }
        gshare = IERC20(_gshare);
        beneficiary = _beneficiary;
        startTimestamp = block.timestamp;
    }

    /// @notice Total amount vested up to now (claimed + claimable)
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp >= startTimestamp + VESTING_DURATION) {
            return TOTAL_ALLOCATION;
        }
        uint256 elapsed = block.timestamp - startTimestamp;
        return (TOTAL_ALLOCATION * elapsed) / VESTING_DURATION;
    }

    /// @notice Claimable right now (vested - already claimed)
    function claimable() public view returns (uint256) {
        return vestedAmount() - claimed;
    }

    /// @notice Claim all currently claimable tokens to beneficiary
    function claim() external {
        if (msg.sender != beneficiary) revert NotBeneficiary();
        uint256 amount = claimable();
        if (amount == 0) revert NothingToClaim();
        claimed += amount;
        gshare.transfer(beneficiary, amount);
        emit Claimed(beneficiary, amount);
    }

    /// @notice Owner can update beneficiary (e.g., switch to multisig)
    function setBeneficiary(address newBeneficiary) external onlyOwner {
        if (newBeneficiary == address(0)) revert ZeroAddress();
        emit BeneficiaryChanged(beneficiary, newBeneficiary);
        beneficiary = newBeneficiary;
    }
}