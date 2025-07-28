// scanner.js - The main scanner file with everything you need
const { ethers } = require("ethers");
const fs = require("fs");

// Only require liquidity analyzer if it exists
let LiquidityAnalyzer;
try {
  LiquidityAnalyzer = require("./liquidity");
} catch (error) {
  console.log("⚠️  Liquidity analyzer not found, LP analysis disabled");
}

// Constants
const WPLS_ADDRESS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
const PULSEX_V2_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";
const PULSEX_V1_FACTORY = "0x29eA7545DEf87022BAdc76323F373EA1e707C523";

class PulseChainScanner {
  constructor() {
    // Setup RPC providers
    this.providers = [
      "https://rpc.pulsechain.com",
      "https://rpc-pulsechain.g4mm4.io",
      "https://pulsechain.publicnode.com"
    ].map(url => new ethers.providers.JsonRpcProvider(url));
    
    this.currentProvider = 0;
    this.cache = new Map();
    
    // Initialize liquidity analyzer if available
    if (LiquidityAnalyzer) {
      this.liquidityAnalyzer = new LiquidityAnalyzer(this);
    }
  }

  // Get next provider (for load balancing)
  getProvider() {
    const provider = this.providers[this.currentProvider];
    this.currentProvider = (this.currentProvider + 1) % this.providers.length;
    return provider;
  }

  // Main scan method - This is what users call
  async scan(walletAddress, options = {}) {
    console.log(`\n🚀 Scanning wallet: ${walletAddress}\n`);
    const startTime = Date.now();

    try {
      // Step 1: Get all tokens from API
      console.log("📡 Getting tokens from PulseChain API...");
      const tokens = await this.getTokensFromAPI(walletAddress);
      
      // Step 2: Get recent tokens from blockchain
      console.log("🔍 Checking recent activity...");
      const recentTokens = await this.getRecentTokens(walletAddress);
      
      // Step 3: Merge and get prices
      console.log("💰 Calculating prices...");
      let allTokens = await this.processTokens([...tokens, ...recentTokens], walletAddress);
      
      // Step 4: Analyze LP tokens if enabled (default: true)
      if (options.analyzeLPs !== false && this.liquidityAnalyzer) {
        console.log("💧 Analyzing liquidity positions...");
        allTokens = await this.liquidityAnalyzer.processLPTokens(allTokens, walletAddress);
      }
      
      // Step 5: Calculate totals
      const totalValue = allTokens.reduce((sum, t) => sum + (t.value || 0), 0);
      const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Generate LP summary
      const lpSummary = this.liquidityAnalyzer ? LiquidityAnalyzer.generateLPSummary(allTokens) : null;
      
      console.log(`\n✅ Scan complete in ${scanTime} seconds!`);
      console.log(`📊 Found ${allTokens.length} tokens worth ${totalValue.toFixed(2)}`);
      
      if (lpSummary) {
        console.log(`💧 Liquidity Positions: ${lpSummary.count} worth ${lpSummary.totalValue.toFixed(2)}`);
      }
      
      return {
        address: walletAddress,
        tokens: allTokens,
        totalValue,
        tokenCount: allTokens.length,
        scanDuration: scanTime,
        lpSummary
      };
      
    } catch (error) {
      console.error("❌ Scan failed:", error.message);
      throw error;
    }
  }

  // Get tokens from PulseChain API
  async getTokensFromAPI(walletAddress) {
    try {
      const url = `https://api.scan.pulsechain.com/api/v2/addresses/${walletAddress}/tokens?type=ERC-20`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.items) return [];
      
      return data.items
        .filter(item => item.type === "ERC-20" && item.value !== "0")
        .map(item => ({
          address: item.token.address.toLowerCase(),
          symbol: item.token.symbol || "Unknown",
          name: item.token.name || "Unknown",
          decimals: parseInt(item.token.decimals) || 18,
          balance: ethers.BigNumber.from(item.value)
        }));
    } catch (error) {
      console.error("API error:", error.message);
      return [];
    }
  }

  // Get tokens from recent blockchain activity
  async getRecentTokens(walletAddress) {
    try {
      const provider = this.getProvider();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock - 28800; // Last 24 hours
      
      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      const addressTopic = ethers.utils.hexZeroPad(walletAddress, 32);
      
      // Get incoming transfers
      const logs = await provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        topics: [transferTopic, null, addressTopic]
      });
      
      // Extract unique token addresses
      const tokenSet = new Set(logs.map(log => log.address.toLowerCase()));
      return Array.from(tokenSet).map(address => ({ address }));
      
    } catch (error) {
      console.error("Recent activity error:", error.message);
      return [];
    }
  }

  // Process tokens: get balances and prices
  async processTokens(tokenList, walletAddress) {
    // Remove duplicates
    const uniqueTokens = new Map();
    tokenList.forEach(token => {
      if (!uniqueTokens.has(token.address)) {
        uniqueTokens.set(token.address, token);
      }
    });

    // Get native PLS balance
    const provider = this.getProvider();
    const plsBalance = await provider.getBalance(walletAddress);
    const plsAmount = parseFloat(ethers.utils.formatEther(plsBalance));
    
    const processedTokens = [];
    
    // Add PLS if has balance
    if (plsAmount > 0) {
      const wplsPrice = await this.getWPLSPrice();
      processedTokens.push({
        address: "native",
        symbol: "PLS",
        name: "PulseChain",
        amount: plsAmount,
        price: wplsPrice,
        value: plsAmount * wplsPrice,
        hasPrice: true
      });
    }

    // Process each token
    for (const [address, tokenInfo] of uniqueTokens) {
      try {
        const processed = await this.processToken(address, tokenInfo, walletAddress);
        if (processed && processed.amount > 0) {
          processedTokens.push(processed);
        }
      } catch (error) {
        // Skip failed tokens
      }
    }

    // Sort by value
    return processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
  }

  // Process a single token
  async processToken(tokenAddress, tokenInfo, walletAddress) {
    const provider = this.getProvider();
    const abi = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function name() view returns (string)"
    ];
    
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    
    // Get token data
    let balance = tokenInfo.balance;
    if (!balance) {
      balance = await contract.balanceOf(walletAddress);
      if (balance.eq(0)) return null;
    }
    
    const [symbol, name, decimals] = await Promise.all([
      tokenInfo.symbol || contract.symbol().catch(() => "Unknown"),
      tokenInfo.name || contract.name().catch(() => "Unknown"),
      tokenInfo.decimals || contract.decimals().catch(() => 18)
    ]);
    
    const amount = parseFloat(ethers.utils.formatUnits(balance, decimals));
    
    // Special handling for WPLS - same price as PLS
    if (tokenAddress.toLowerCase() === WPLS_ADDRESS.toLowerCase()) {
      const wplsPrice = await this.getWPLSPrice();
      return {
        address: tokenAddress,
        symbol,
        name,
        decimals,
        amount,
        price: wplsPrice,
        value: amount * wplsPrice,
        hasPrice: true,
        liquidity: 1000000 // WPLS has high liquidity
      };
    }
    
    // Get price for other tokens
    const priceData = await this.getTokenPrice(tokenAddress, decimals);
    
    return {
      address: tokenAddress,
      symbol,
      name,
      decimals,
      amount,
      price: priceData.price || 0,
      value: amount * (priceData.price || 0),
      hasPrice: priceData.hasPrice,
      liquidity: priceData.liquidity
    };
  }

  // Get token price from liquidity pools
  async getTokenPrice(tokenAddress, decimals) {
    // Check cache
    const cached = this.cache.get(tokenAddress);
    if (cached && Date.now() - cached.time < 300000) { // 5 min cache
      return cached.data;
    }

    try {
      const wplsPrice = await this.getWPLSPrice();
      const provider = this.getProvider();
      
      // Try both factories
      for (const factory of [PULSEX_V2_FACTORY, PULSEX_V1_FACTORY]) {
        const factoryContract = new ethers.Contract(
          factory,
          ["function getPair(address,address) view returns (address)"],
          provider
        );
        
        const pairAddress = await factoryContract.getPair(tokenAddress, WPLS_ADDRESS);
        if (pairAddress === ethers.constants.AddressZero) continue;
        
        // Get reserves
        const pairContract = new ethers.Contract(
          pairAddress,
          [
            "function getReserves() view returns (uint112,uint112,uint32)",
            "function token0() view returns (address)"
          ],
          provider
        );
        
        const [reserves, token0] = await Promise.all([
          pairContract.getReserves(),
          pairContract.token0()
        ]);
        
        const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
        const tokenReserve = isToken0 ? reserves[0] : reserves[1];
        const wplsReserve = isToken0 ? reserves[1] : reserves[0];
        
        const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, decimals));
        const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, 18));
        
        if (tokenAmount > 0 && wplsAmount > 10) {
          const priceInWPLS = wplsAmount / tokenAmount;
          const priceInUSD = priceInWPLS * wplsPrice;
          const liquidity = wplsAmount * wplsPrice * 2;
          
          const result = {
            price: priceInUSD,
            hasPrice: true,
            liquidity
          };
          
          // Cache it
          this.cache.set(tokenAddress, { data: result, time: Date.now() });
          return result;
        }
      }
    } catch (error) {
      // Price fetch failed
    }
    
    return { price: 0, hasPrice: false, liquidity: 0 };
  }

  // Get WPLS price from stablecoin pairs
  async getWPLSPrice() {
    // Check cache
    const cached = this.cache.get('wpls-price');
    if (cached && Date.now() - cached.time < 60000) { // 1 min cache
      return cached.data;
    }

    try {
      const provider = this.getProvider();
      const stablecoins = [
        "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", // USDC
        "0xefD766cCb38EaF1dfd701853BFCe31359239F305", // DAI
        "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f"  // USDT
      ];
      
      let bestPrice = 0;
      let bestLiquidity = 0;
      
      for (const factory of [PULSEX_V2_FACTORY, PULSEX_V1_FACTORY]) {
        for (const stable of stablecoins) {
          try {
            const factoryContract = new ethers.Contract(
              factory,
              ["function getPair(address,address) view returns (address)"],
              provider
            );
            
            const pairAddress = await factoryContract.getPair(WPLS_ADDRESS, stable);
            if (pairAddress === ethers.constants.AddressZero) continue;
            
            const pairContract = new ethers.Contract(
              pairAddress,
              [
                "function getReserves() view returns (uint112,uint112,uint32)",
                "function token0() view returns (address)"
              ],
              provider
            );
            
            const [reserves, token0] = await Promise.all([
              pairContract.getReserves(),
              pairContract.token0()
            ]);
            
            const isWPLSToken0 = token0.toLowerCase() === WPLS_ADDRESS.toLowerCase();
            const wplsReserve = isWPLSToken0 ? reserves[0] : reserves[1];
            const stableReserve = isWPLSToken0 ? reserves[1] : reserves[0];
            
            // Handle different decimals (USDC/USDT = 6, DAI = 18)
            const stableDecimals = stable.toLowerCase() === stablecoins[1].toLowerCase() ? 18 : 6;
            
            const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, 18));
            const stableAmount = parseFloat(ethers.utils.formatUnits(stableReserve, stableDecimals));
            
            if (wplsAmount > 0) {
              const price = stableAmount / wplsAmount;
              const liquidity = stableAmount * 2;
              
              if (liquidity > bestLiquidity) {
                bestPrice = price;
                bestLiquidity = liquidity;
              }
            }
          } catch (error) {
            // Skip this pair
          }
        }
      }
      
      const finalPrice = bestPrice > 0 ? bestPrice : 0.000032; // Fallback
      this.cache.set('wpls-price', { data: finalPrice, time: Date.now() });
      return finalPrice;
      
    } catch (error) {
      return 0.000032; // Fallback price
    }
  }
}

// Export the scanner
module.exports = PulseChainScanner;