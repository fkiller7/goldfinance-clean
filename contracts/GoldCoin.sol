// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GoldCoin (GOLD)
 * @notice The reward token of Gold Finance protocol.
 * @dev Capped at 21B supply (Bitcoin-parallel narrative).
 *      Multi-minter: Boardroom mints rewards, BuybackController can burn/inject.
 *      10% sell tax on AMM trades → BuybackController.
 */
contract GoldCoin is ERC20, Ownable {
    // ============= CONSTANTS =============

    uint256 public constant MAX_SUPPLY = 21_000_000_000 ether; // 21 billion
    uint256 public constant SELL_TAX_BPS = 1000; // 10% = 1000 basis points
    uint256 public constant BPS_DIVISOR = 10_000;

    // ============= STATE =============

    /// @notice Whitelisted minters (Boardroom, BuybackController, etc.)
    mapping(address => bool) public minters;

    /// @notice AMM pair addresses (transfers TO these get taxed = sells)
    mapping(address => bool) public ammPairs;

    /// @notice Addresses exempt from sell tax (router, treasury, etc.)
    mapping(address => bool) public taxExempt;

    /// @notice Where the sell tax goes
    address public buybackController;

    // ============= EVENTS =============

    event MinterUpdated(address indexed minter, bool allowed);
    event AmmPairUpdated(address indexed pair, bool isPair);
    event TaxExemptUpdated(address indexed addr, bool exempt);
    event BuybackControllerUpdated(address indexed controller);
    event TaxCollected(address indexed from, uint256 amount);

    // ============= ERRORS =============

    error NotMinter();
    error MaxSupplyExceeded();
    error ZeroAddress();

    // ============= MODIFIERS =============

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    // ============= CONSTRUCTOR =============

    constructor() ERC20("Gold Coin", "GOLD") Ownable(msg.sender) {
        // Owner is initially a minter so they can seed initial liquidity
        minters[msg.sender] = true;
        taxExempt[msg.sender] = true;
        emit MinterUpdated(msg.sender, true);
        emit TaxExemptUpdated(msg.sender, true);
    }

    // ============= ADMIN =============

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function setAmmPair(address pair, bool isPair) external onlyOwner {
        if (pair == address(0)) revert ZeroAddress();
        ammPairs[pair] = isPair;
        emit AmmPairUpdated(pair, isPair);
    }

    function setTaxExempt(address addr, bool exempt) external onlyOwner {
        if (addr == address(0)) revert ZeroAddress();
        taxExempt[addr] = exempt;
        emit TaxExemptUpdated(addr, exempt);
    }

    function setBuybackController(address controller) external onlyOwner {
        if (controller == address(0)) revert ZeroAddress();
        buybackController = controller;
        // Auto-exempt from tax (it receives tax, doesn't pay it)
        taxExempt[controller] = true;
        emit BuybackControllerUpdated(controller);
    }

    // ============= MINT =============

    /// @notice Mint new GOLD (only authorized minters)
    /// @dev Reverts if exceeding 21B max supply
    function mint(address to, uint256 amount) external onlyMinter {
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /// @notice Burn from caller (anyone can burn their own tokens)
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ============= TRANSFER WITH TAX =============

    function _update(address from, address to, uint256 value) internal override {
        // No tax on mint/burn or if either side is exempt
        if (from == address(0) || to == address(0) || taxExempt[from] || taxExempt[to]) {
            super._update(from, to, value);
            return;
        }

        // Tax only on SELLS (transfer TO an AMM pair)
        if (ammPairs[to] && buybackController != address(0)) {
            uint256 tax = (value * SELL_TAX_BPS) / BPS_DIVISOR;
            uint256 amountAfterTax = value - tax;

            super._update(from, buybackController, tax);
            super._update(from, to, amountAfterTax);

            emit TaxCollected(from, tax);
        } else {
            super._update(from, to, value);
        }
    }

    // ============= VIEW =============

    function remainingMintCapacity() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}