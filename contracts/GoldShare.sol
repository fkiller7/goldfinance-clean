// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GoldShare (GSHARE)
 * @notice Governance/share token of Gold Finance protocol
 * @dev - Hard cap: 350,000 GSHARE
 *      - Distribution at launch:
 *          2,000 → treasury (LP seed)
 *          5,000 → treasury (marketing reserve, includes 2,500 hot start)
 *          26,250 → TeamVester (locked, 2-year linear vesting)
 *          316,750 → mintable by GoldShareFarm over 20 years
 *      - Multi-minter pattern: GoldShareFarm and TeamVester
 */
contract GoldShare is ERC20, Ownable {
    /// @notice Hard cap — never exceeded
    uint256 public constant MAX_SUPPLY = 350_000 * 1e18;

    /// @notice Initial mint at deploy: LP seed + marketing reserve
    uint256 public constant INITIAL_TREASURY_MINT = 7_000 * 1e18;

    /// @notice Team vesting allocation (must be minted to TeamVester)
    uint256 public constant TEAM_ALLOCATION = 26_250 * 1e18;

    /// @notice Maximum mintable by farms (= 350K - 7K - 26.25K)
    uint256 public constant FARM_ALLOCATION = 316_750 * 1e18;

    /// @notice Addresses allowed to mint (Farm + Vester)
    mapping(address => bool) public minters;

    /// @notice Track if team allocation has been distributed yet
    bool public teamAllocationMinted;

    event MinterSet(address indexed minter, bool allowed);
    event TeamAllocationMinted(address indexed vester, uint256 amount);

    error NotMinter();
    error CapExceeded();
    error ZeroAddress();
    error AlreadyMinted();

    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner()) revert NotMinter();
        _;
    }

    constructor(address admin, address treasury) ERC20("GoldShare", "GSHARE") Ownable(admin) {
        if (admin == address(0) || treasury == address(0)) revert ZeroAddress();
        _mint(treasury, INITIAL_TREASURY_MINT); // 7,000 GSHARE direct
    }

    // ============= MINTING =============

    /// @notice Mint new GSHARE — only authorized minters, respects cap
    function mint(address to, uint256 amount) external onlyMinter {
        if (totalSupply() + amount > MAX_SUPPLY) revert CapExceeded();
        _mint(to, amount);
    }

    /// @notice One-time mint of full team allocation to TeamVester contract
    /// @dev Called by owner after deploying TeamVester
    function mintTeamAllocation(address teamVester) external onlyOwner {
        if (teamAllocationMinted) revert AlreadyMinted();
        if (teamVester == address(0)) revert ZeroAddress();
        teamAllocationMinted = true;
        _mint(teamVester, TEAM_ALLOCATION);
        emit TeamAllocationMinted(teamVester, TEAM_ALLOCATION);
    }

    /// @notice Burn caller's GSHARE
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ============= ADMIN =============

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    // ============= VIEW =============

    /// @notice Hoeveel GSHARE kan nog gemint worden?
    function remainingMintable() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}