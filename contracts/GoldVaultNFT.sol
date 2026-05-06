// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

interface IGoldCoinFull {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

interface IPriceOracle {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

interface IGoldFinanceUSDOracle {
    /// @notice Returns GOLD price in USD with 8 decimals (e.g., $0.001 = 100000)
    function goldPriceUSD() external view returns (uint256);
}

/**
 * @title GoldVaultNFT
 * @notice ERC721 representing a claim on 1 gram physical gold
 * @dev - Model B (two-way redemption):
 *        - Mint: pay GOLD tokens → receive NFT (1g gold)
 *        - Redeem: return NFT → receive GOLD tokens (with 5% fee)
 *      - Pricing: Chainlink XAU/USD oracle + GOLD/USD admin-set or oracle
 *      - Mint fee: 10% burnt (deflationary)
 *      - Redeem fee: 5% to treasury
 *      - On-chain SVG metadata
 */
contract GoldVaultNFT is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    IGoldCoinFull public immutable gold;
    IPriceOracle public xauOracle;        // Chainlink XAU/USD (8 decimals)
    IGoldFinanceUSDOracle public goldOracle; // optional: GOLD/USD oracle

    address public treasury;

    /// @notice Manual GOLD/USD price (used if no oracle set), 8 decimals
    /// @dev Default: $0.001 = 100,000 (10^5 with 8 decimals)
    uint256 public manualGoldPriceUSD = 100_000; // $0.001

    /// @notice Token ID counter
    uint256 public nextTokenId = 1;

    /// @notice Mint fee (basis points): 10% = 1000
    uint256 public mintFeeBps = 1000;
    /// @notice Redeem fee (basis points): 5% = 500
    uint256 public redeemFeeBps = 500;

    /// @notice Hard cap on fees (max 20% per side)
    uint256 public constant MAX_FEE_BPS = 2000;

    /// @notice Active NFT supply (for fully-redeemable check)
    uint256 public totalActiveNFTs;

    /// @notice Stats
    uint256 public totalMinted;
    uint256 public totalRedeemed;
    uint256 public totalGoldBurnt;
    uint256 public totalFeesCollected;

    /// @notice Off-chain reference: links NFT id to physical gold serial/cert
    mapping(uint256 => string) public physicalGoldRef;

    /// @notice Whether this NFT has been physically delivered (one-way)
    /// @dev Once delivered, can't be redeemed back to GOLD
    mapping(uint256 => bool) public physicallyDelivered;

    event Minted(address indexed to, uint256 indexed tokenId, uint256 goldPaid, uint256 burnt);
    event Redeemed(address indexed from, uint256 indexed tokenId, uint256 goldReturned, uint256 fee);
    event PhysicallyDelivered(uint256 indexed tokenId, string deliveryRef);
    event TreasurySet(address indexed treasury);
    event OracleSet(address indexed xauOracle, address indexed goldOracle);
    event ManualGoldPriceSet(uint256 priceUSD);
    event FeesSet(uint256 mintBps, uint256 redeemBps);
    event PhysicalRefSet(uint256 indexed tokenId, string ref);

    error ZeroAddress();
    error NotOwner();
    error AlreadyDelivered();
    error InvalidFee();
    error OracleStale();
    error NoPriceSource();

    constructor(
        address admin,
        address _gold,
        address _treasury
    ) ERC721("Gold Finance Vault NFT", "GVAULT") Ownable(admin) {
        if (admin == address(0) || _gold == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        gold = IGoldCoinFull(_gold);
        treasury = _treasury;
    }

    // ============= PRICING =============

    /// @notice Returns price of 1g gold in USD (8 decimals)
    /// @dev Chainlink XAU is per troy ounce. 1 troy oz = 31.1035 grams
    function getGoldPricePerGramUSD() public view returns (uint256) {
        if (address(xauOracle) == address(0)) revert NoPriceSource();
        (, int256 answer, , uint256 updatedAt, ) = xauOracle.latestRoundData();
        if (answer <= 0) revert OracleStale();
        if (block.timestamp - updatedAt > 24 hours) revert OracleStale();

        uint256 oracleDecimals = xauOracle.decimals();
        uint256 pricePerOz = uint256(answer); // e.g., $4,000/oz at 8 decimals = 400000000000

        // Normalize to 8 decimals if oracle differs
        if (oracleDecimals > 8) {
            pricePerOz = pricePerOz / (10 ** (oracleDecimals - 8));
        } else if (oracleDecimals < 8) {
            pricePerOz = pricePerOz * (10 ** (8 - oracleDecimals));
        }

        // 1 troy oz = 31.1035 grams → use 311035 / 10000 for precision
        return (pricePerOz * 10_000) / 311_035;
    }

    /// @notice Returns GOLD/USD price (8 decimals)
    function getGoldTokenPriceUSD() public view returns (uint256) {
        if (address(goldOracle) != address(0)) {
            return goldOracle.goldPriceUSD();
        }
        return manualGoldPriceUSD;
    }

    /// @notice How much GOLD does it cost to mint 1 NFT?
    function mintPriceInGold() public view returns (uint256) {
        uint256 goldPerGramUSD = getGoldPricePerGramUSD(); // 8 decimals
        uint256 goldTokenUSD = getGoldTokenPriceUSD();     // 8 decimals
        if (goldTokenUSD == 0) revert NoPriceSource();
        // amount of GOLD (18 decimals) = (gramUSD / tokenUSD) × 1e18
        return (goldPerGramUSD * 1e18) / goldTokenUSD;
    }

    /// @notice How much GOLD do I get back when redeeming an NFT? (after fee)
    function redeemValueInGold() public view returns (uint256 gross, uint256 fee, uint256 net) {
        gross = mintPriceInGold();
        fee = (gross * redeemFeeBps) / 10_000;
        net = gross - fee;
    }

    // ============= MINT / REDEEM =============

    /// @notice Mint a new NFT by paying GOLD
    function mint() external nonReentrant returns (uint256 tokenId) {
        uint256 cost = mintPriceInGold();
        uint256 burnAmount = (cost * mintFeeBps) / 10_000;
        uint256 toTreasury = cost - burnAmount;

        // Pull GOLD from minter
        gold.transferFrom(msg.sender, address(this), cost);

        // Burn fee portion
        gold.burn(burnAmount);
        totalGoldBurnt += burnAmount;

        // Send rest to treasury (these GOLD back the physical gold purchase)
        gold.transfer(treasury, toTreasury);

        tokenId = nextTokenId++;
        totalMinted++;
        totalActiveNFTs++;

        _safeMint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, cost, burnAmount);
    }

    /// @notice Redeem an NFT for GOLD (must own NFT, not delivered)
    function redeem(uint256 tokenId) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (physicallyDelivered[tokenId]) revert AlreadyDelivered();

        (uint256 gross, uint256 fee, uint256 net) = redeemValueInGold();

        // Treasury must have enough GOLD to honor redemption
        // (if not, treasury must replenish from physical gold sale)
        gold.transferFrom(treasury, msg.sender, net);
        if (fee > 0) {
            gold.transferFrom(treasury, address(this), fee);
            // fee stays in this contract, can be moved later
            totalFeesCollected += fee;
        }

        _burn(tokenId);
        totalRedeemed++;
        totalActiveNFTs--;

        emit Redeemed(msg.sender, tokenId, net, fee);
        // suppress unused-variable warning
        gross;
    }

    // ============= ADMIN =============

    /// @notice Mark NFT as physically delivered (one-way)
    function markPhysicallyDelivered(uint256 tokenId, string calldata deliveryRef) external onlyOwner {
        physicallyDelivered[tokenId] = true;
        physicalGoldRef[tokenId] = deliveryRef;
        emit PhysicallyDelivered(tokenId, deliveryRef);
        emit PhysicalRefSet(tokenId, deliveryRef);
    }

    /// @notice Set the physical gold reference (custodian cert/serial)
    function setPhysicalRef(uint256 tokenId, string calldata ref) external onlyOwner {
        physicalGoldRef[tokenId] = ref;
        emit PhysicalRefSet(tokenId, ref);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setXauOracle(address _oracle) external onlyOwner {
        xauOracle = IPriceOracle(_oracle);
        emit OracleSet(_oracle, address(goldOracle));
    }

    function setGoldOracle(address _oracle) external onlyOwner {
        goldOracle = IGoldFinanceUSDOracle(_oracle);
        emit OracleSet(address(xauOracle), _oracle);
    }

    function setManualGoldPriceUSD(uint256 priceUSD) external onlyOwner {
        manualGoldPriceUSD = priceUSD;
        emit ManualGoldPriceSet(priceUSD);
    }

    function setFees(uint256 mintBps, uint256 redeemBps) external onlyOwner {
        if (mintBps > MAX_FEE_BPS || redeemBps > MAX_FEE_BPS) revert InvalidFee();
        mintFeeBps = mintBps;
        redeemFeeBps = redeemBps;
        emit FeesSet(mintBps, redeemBps);
    }

    /// @notice Withdraw collected fees from this contract (rare)
    function withdrawFees() external onlyOwner {
        uint256 bal = gold.balanceOf(address(this));
        if (bal > 0) {
            gold.transfer(treasury, bal);
        }
    }

    // ============= METADATA (on-chain SVG) =============

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory svg = _generateSVG(tokenId);
        bool delivered = physicallyDelivered[tokenId];
        string memory ref = physicalGoldRef[tokenId];

        string memory json = string.concat(
            '{"name":"Gold Finance Vault #', tokenId.toString(),
            '","description":"This NFT represents a claim on 1 gram of physical gold backed by Gold Finance treasury.",',
            '"attributes":[',
                '{"trait_type":"Weight","value":"1 gram"},',
                '{"trait_type":"Status","value":"', delivered ? "Delivered" : "Vaulted", '"},',
                '{"trait_type":"Reference","value":"', bytes(ref).length > 0 ? ref : "Unassigned", '"}',
            '],',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _generateSVG(uint256 tokenId) internal view returns (string memory) {
        bool delivered = physicallyDelivered[tokenId];
        string memory statusLabel = delivered ? "DELIVERED" : "VAULTED";
        string memory bgColor = delivered ? "#1a1a1a" : "#0a0a0a";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">',
            '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="#f3ba2f"/><stop offset="100%" stop-color="#b8860b"/>',
            '</linearGradient></defs>',
            '<rect width="400" height="500" fill="', bgColor, '"/>',
            '<rect x="20" y="20" width="360" height="460" fill="none" stroke="url(#g)" stroke-width="2"/>',
            '<text x="200" y="80" text-anchor="middle" font-family="serif" font-size="28" fill="url(#g)" font-weight="bold">GOLD FINANCE</text>',
            '<text x="200" y="120" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#888">VAULT NFT</text>',
            '<circle cx="200" cy="240" r="80" fill="url(#g)"/>',
            '<text x="200" y="245" text-anchor="middle" font-family="serif" font-size="36" fill="#000" font-weight="bold">1g</text>',
            '<text x="200" y="270" text-anchor="middle" font-family="serif" font-size="14" fill="#000">GOLD</text>',
            '<text x="200" y="380" text-anchor="middle" font-family="sans-serif" font-size="20" fill="url(#g)">#', tokenId.toString(), '</text>',
            '<text x="200" y="430" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#888">', statusLabel, '</text>',
            '</svg>'
        );
    }
}