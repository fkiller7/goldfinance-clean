// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20Burnable {
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPancakePair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IAggregator {
    function latestAnswer() external view returns (int256);
    function decimals() external view returns (uint8);
}

/**
 * @title GoldVaultNFTv2
 * @notice Multi-product physical metal-backed NFT vault
 * @dev Each NFT represents claim on physical gold/silver weight
 *      Users burn GOLD tokens + pay BNB fee to mint
 *      Owner can mark NFTs as physically delivered
 */
contract GoldVaultNFTv2 is ERC721, Ownable, ReentrancyGuard {
    
    // ============ ENUMS ============
    
    enum Metal { GOLD, SILVER }
    
    // ============ STRUCTS ============
    
    struct Product {
        string name;            // "1g Gold", "1oz Silver"
        uint256 weightMg;       // weight in milligrams
        Metal metal;
        bool active;
        uint256 totalMinted;
        uint256 totalRedeemed;
    }
    
    struct VaultNFT {
        uint256 productId;
        uint256 mintedAt;
        uint256 goldBurnedAtMint;
        bool physicallyDelivered;
        string physicalRef;
    }
    
    // ============ STATE ============
    
    Product[] public products;
    mapping(uint256 => VaultNFT) public vaultData;
    
    IERC20Burnable public immutable goldToken;
    address public treasury;
    
    // Pricing
    IAggregator public xauOracle;       // Gold USD oracle
    IAggregator public xagOracle;       // Silver USD oracle
    IPancakePair public goldBnbLP;      // For auto GOLD price (via BNB)
    address public wbnb;                // For LP price calc
    
    uint256 public manualGoldPriceUSD;       // 8 decimals (e.g. $4000 = 400000000000)
    uint256 public manualSilverPriceUSD;     // 8 decimals
    uint256 public manualGoldTokenPriceUSD;  // 8 decimals (e.g. $0.001 = 100000)
    uint256 public manualBnbPriceUSD;        // 8 decimals (for BNB fee calc)
    
    bool public useAutoGoldTokenPrice;
    
    // Fees (basis points)
    uint256 public mintBurnFeeBps = 100;     // 1% extra GOLD burned
    uint256 public mintBnbFeeBps = 300;      // 3% in BNB to treasury
    uint256 public constant MAX_FEE_BPS = 1000;  // 10% cap on each
    
    // Mint cap (0 = unlimited)
    uint256 public maxMintsPerWallet = 0;
    mapping(address => uint256) public mintCount;
    
    // Stats
    uint256 public totalGoldBurnt;
    uint256 public totalActiveNFTs;
    uint256 private _nextTokenId = 1;
    
    // ============ EVENTS ============
    
    event ProductAdded(uint256 indexed productId, string name, uint256 weightMg, Metal metal);
    event ProductActiveSet(uint256 indexed productId, bool active);
    event NFTMinted(address indexed user, uint256 indexed tokenId, uint256 productId, uint256 goldBurned, uint256 bnbFee);
    event NFTRedeemed(address indexed user, uint256 indexed tokenId);
    event PhysicallyDelivered(uint256 indexed tokenId, string physicalRef);
    event ManualPricesSet(uint256 gold, uint256 silver, uint256 goldToken, uint256 bnb);
    event OraclesSet(address xau, address xag);
    event FeesSet(uint256 burnBps, uint256 bnbBps);
    event TreasurySet(address treasury);
    
    // ============ CONSTRUCTOR ============
    
    constructor(
        address _goldToken,
        address _treasury
    ) ERC721("Gold Vault NFT v2", "GVNFTv2") Ownable(msg.sender) {
        require(_goldToken != address(0), "gold zero");
        require(_treasury != address(0), "treasury zero");
        goldToken = IERC20Burnable(_goldToken);
        treasury = _treasury;
        
        // Initial manual prices (testnet defaults)
        manualGoldPriceUSD = 4000_00000000;       // $4,000/oz
        manualSilverPriceUSD = 50_00000000;       // $50/oz
        manualGoldTokenPriceUSD = 100000;         // $0.001
        manualBnbPriceUSD = 600_00000000;         // $600/BNB
        
        // Register 6 default products
        _addProduct("1g Gold", 1000, Metal.GOLD);
        _addProduct("5g Gold", 5000, Metal.GOLD);
        _addProduct("10g Gold", 10000, Metal.GOLD);
        _addProduct("1oz Gold", 31103, Metal.GOLD);
        _addProduct("1oz Silver", 31103, Metal.SILVER);
        _addProduct("10oz Silver", 311035, Metal.SILVER);
    }
    
    // ============ MINT / REDEEM ============
    
    function mint(uint256 productId) external payable nonReentrant returns (uint256 tokenId) {
        require(productId < products.length, "bad product");
        Product storage p = products[productId];
        require(p.active, "product inactive");
        
        if (maxMintsPerWallet > 0) {
            require(mintCount[msg.sender] < maxMintsPerWallet, "wallet cap");
        }
        
        (uint256 goldNeeded, uint256 bnbFeeNeeded) = quoteMint(productId);
        
        require(msg.value >= bnbFeeNeeded, "insufficient BNB fee");
        
        // Pull GOLD from user, then burn from contract balance
        require(
            goldToken.transferFrom(msg.sender, address(this), goldNeeded),
            "GOLD transfer failed"
        );
        goldToken.burn(goldNeeded);
        
        // Send BNB fee to treasury
        if (bnbFeeNeeded > 0) {
            (bool ok, ) = treasury.call{value: bnbFeeNeeded}("");
            require(ok, "bnb transfer failed");
        }
        
        // Refund excess BNB
        if (msg.value > bnbFeeNeeded) {
            (bool ok, ) = msg.sender.call{value: msg.value - bnbFeeNeeded}("");
            require(ok, "refund failed");
        }
        
        // Mint NFT
        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        
        vaultData[tokenId] = VaultNFT({
            productId: productId,
            mintedAt: block.timestamp,
            goldBurnedAtMint: goldNeeded,
            physicallyDelivered: false,
            physicalRef: ""
        });
        
        // Stats
        p.totalMinted++;
        totalActiveNFTs++;
        totalGoldBurnt += goldNeeded;
        mintCount[msg.sender]++;
        
        emit NFTMinted(msg.sender, tokenId, productId, goldNeeded, bnbFeeNeeded);
    }
    
    function redeem(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        require(!vaultData[tokenId].physicallyDelivered, "already delivered");
        
        VaultNFT storage v = vaultData[tokenId];
        Product storage p = products[v.productId];
        
        v.physicallyDelivered = true;
        p.totalRedeemed++;
        totalActiveNFTs--;
        
        _burn(tokenId);
        
        emit NFTRedeemed(msg.sender, tokenId);
    }
    
    // ============ QUOTES (read-only for UI) ============
    
    function quoteMint(uint256 productId) public view returns (uint256 goldNeeded, uint256 bnbFeeNeeded) {
        require(productId < products.length, "bad product");
        Product memory p = products[productId];
        
        // 1. Get metal price USD per oz (8 decimals)
        uint256 metalPricePerOz = getMetalPriceUSD(p.metal);
        
        // 2. Calculate USD value of weight (8 decimals)
        // weightMg / 31103mg per oz = ozs (scaled)
        // metalPricePerOz × weightMg / 31103
        uint256 valueUsd = (metalPricePerOz * p.weightMg) / 31103;
        
        // 3. Convert to GOLD tokens (gold has 18 decimals, prices have 8)
        uint256 goldPriceUsd = getGoldTokenPriceUSD();
        require(goldPriceUsd > 0, "gold price zero");
        
        uint256 baseGold = (valueUsd * 1e18) / goldPriceUsd;
        uint256 burnFeeGold = (baseGold * mintBurnFeeBps) / 10000;
        goldNeeded = baseGold + burnFeeGold;
        
        // 4. BNB fee = 3% of USD value, converted to BNB
        uint256 bnbFeeUsd = (valueUsd * mintBnbFeeBps) / 10000;
        uint256 bnbPriceUsd = manualBnbPriceUSD;
        require(bnbPriceUsd > 0, "bnb price zero");
        bnbFeeNeeded = (bnbFeeUsd * 1e18) / bnbPriceUsd;
    }
    
    function getMetalPriceUSD(Metal metal) public view returns (uint256) {
        if (metal == Metal.GOLD) {
            if (address(xauOracle) != address(0)) {
                try xauOracle.latestAnswer() returns (int256 price) {
                    if (price > 0) return uint256(price);
                } catch {}
            }
            return manualGoldPriceUSD;
        } else {
            if (address(xagOracle) != address(0)) {
                try xagOracle.latestAnswer() returns (int256 price) {
                    if (price > 0) return uint256(price);
                } catch {}
            }
            return manualSilverPriceUSD;
        }
    }
    
    function getGoldTokenPriceUSD() public view returns (uint256) {
        // If auto pricing on AND LP set: try to derive from LP
        if (useAutoGoldTokenPrice && address(goldBnbLP) != address(0)) {
            try this._readLpGoldPriceUSD() returns (uint256 price) {
                if (price > 0) return price;
            } catch {}
        }
        return manualGoldTokenPriceUSD;
    }
    
    function _readLpGoldPriceUSD() external view returns (uint256) {
        // GOLD price in USD = (BNB reserve / GOLD reserve) × BNB_USD_price
        require(msg.sender == address(this), "internal only");
        (uint112 r0, uint112 r1, ) = goldBnbLP.getReserves();
        address t0 = goldBnbLP.token0();
        
        uint256 goldReserve;
        uint256 bnbReserve;
        if (t0 == address(goldToken)) {
            goldReserve = r0;
            bnbReserve = r1;
        } else {
            goldReserve = r1;
            bnbReserve = r0;
        }
        require(goldReserve > 0, "no gold liquidity");
        
        // GOLD per BNB ratio
        // GOLD price USD = (BNB / GOLD) × BNB_price_USD
        uint256 bnbPerGold = (bnbReserve * 1e18) / goldReserve;
        return (bnbPerGold * manualBnbPriceUSD) / 1e18;
    }
    
    // ============ ADMIN: PRODUCTS ============
    
    function _addProduct(string memory name, uint256 weightMg, Metal metal) internal {
        products.push(Product({
            name: name,
            weightMg: weightMg,
            metal: metal,
            active: true,
            totalMinted: 0,
            totalRedeemed: 0
        }));
        emit ProductAdded(products.length - 1, name, weightMg, metal);
    }
    
    function addProduct(string memory name, uint256 weightMg, Metal metal) external onlyOwner {
        _addProduct(name, weightMg, metal);
    }
    
    function setProductActive(uint256 productId, bool active) external onlyOwner {
        require(productId < products.length, "bad product");
        products[productId].active = active;
        emit ProductActiveSet(productId, active);
    }
    
    function productCount() external view returns (uint256) {
        return products.length;
    }
    
    // ============ ADMIN: PRICING ============
    
    function setOracles(address _xau, address _xag) external onlyOwner {
        xauOracle = IAggregator(_xau);
        xagOracle = IAggregator(_xag);
        emit OraclesSet(_xau, _xag);
    }
    
    function setGoldBnbLP(address _lp, address _wbnb) external onlyOwner {
        goldBnbLP = IPancakePair(_lp);
        wbnb = _wbnb;
    }
    
    function setUseAutoGoldTokenPrice(bool _use) external onlyOwner {
        useAutoGoldTokenPrice = _use;
    }
    
    function setManualPrices(
        uint256 _gold,
        uint256 _silver,
        uint256 _goldToken,
        uint256 _bnb
    ) external onlyOwner {
        manualGoldPriceUSD = _gold;
        manualSilverPriceUSD = _silver;
        manualGoldTokenPriceUSD = _goldToken;
        manualBnbPriceUSD = _bnb;
        emit ManualPricesSet(_gold, _silver, _goldToken, _bnb);
    }
    
    // ============ ADMIN: FEES & CAP ============
    
    function setFees(uint256 _burnBps, uint256 _bnbBps) external onlyOwner {
        require(_burnBps <= MAX_FEE_BPS, "burn fee too high");
        require(_bnbBps <= MAX_FEE_BPS, "bnb fee too high");
        mintBurnFeeBps = _burnBps;
        mintBnbFeeBps = _bnbBps;
        emit FeesSet(_burnBps, _bnbBps);
    }
    
    function setMaxMintsPerWallet(uint256 _max) external onlyOwner {
        maxMintsPerWallet = _max;
    }
    
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }
    
    // ============ ADMIN: PHYSICAL DELIVERY ============
    
    function markPhysicallyDelivered(uint256 tokenId, string memory ref) external onlyOwner {
        require(_ownerOf(tokenId) != address(0) || vaultData[tokenId].mintedAt > 0, "no nft");
        vaultData[tokenId].physicallyDelivered = true;
        vaultData[tokenId].physicalRef = ref;
        emit PhysicallyDelivered(tokenId, ref);
    }
    
    // ============ EMERGENCY ============
    
    function rescueBNB(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "rescue failed");
    }
    
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(goldToken), "no gold rescue");
        IERC20Burnable(token).transfer(to, amount);
    }
    
    receive() external payable {}
}
