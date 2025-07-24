import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { executeWithFailover } from './rpc-provider';

// Constants
const WPLS_ADDRESS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
const PULSEX_V2_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";
const PULSEX_V1_FACTORY = "0x29eA7545DEf87022BAdc76323F373EA1e707C523";
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = "native";

// Blacklisted tokens that cause issues
const BLACKLISTED_TOKENS = new Set([
  "0xd3ab6b7203c417c2b71c36aeade50020c1f6e41a" // ultlotto - causes astronomical values
]);

// Cache type
interface CacheEntry<T> {
  data: T;
  time: number;
}

// LP Token info interface
interface LPTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;
  balance: ethers.BigNumber;
  isLiquidityPair: boolean;
  pairInfo?: {
    token0: {
      address: string;
      symbol: string;
      name: string;
      amount: number;
      price: number;
      value: number;
    };
    token1: {
      address: string;
      symbol: string;
      name: string;
      amount: number;
      price: number;
      value: number;
    };
    userSharePercent: number;
    totalReserves: {
      token0: number;
      token1: number;
    };
  };
  price: number;
  value: number;
  hasPrice: boolean;
  liquidity: number;
}

// Extend ProcessedToken to include lpDetails
interface EnhancedProcessedToken extends ProcessedToken {
  lpDetails?: any;
}

export class EnhancedPulseChainScanner {
  private cache: Map<string, CacheEntry<any>> = new Map();

  // Main scan method
  async scan(walletAddress: string, options: { analyzeLPs?: boolean } = {}): Promise<{
    address: string;
    tokens: ProcessedToken[];
    totalValue: number;
    tokenCount: number;
    scanDuration: string;
    lpSummary?: any;
  }> {
    // Normalize wallet address to checksummed format
    try {
      // Convert to lowercase first to handle mixed-case addresses
      walletAddress = ethers.utils.getAddress(walletAddress.toLowerCase());
    } catch (error) {
      throw new Error(`Invalid wallet address: ${walletAddress}`);
    }
    
    console.log(`🚀 Enhanced scanner: Scanning wallet ${walletAddress}`);
    const startTime = Date.now();

    try {
      // Step 1: Get all tokens from API
      console.log("📡 Getting tokens from PulseChain API...");
      const apiTokens = await this.getTokensFromAPI(walletAddress);
      
      // Step 2: Get recent tokens from blockchain
      console.log("🔍 Checking recent activity...");
      const recentTokens = await this.getRecentTokens(walletAddress);
      
      // Step 3: Merge and get prices
      console.log("💰 Calculating prices...");
      let allTokens = await this.processTokens([...apiTokens, ...recentTokens], walletAddress);
      
      // Step 4: Analyze LP tokens if enabled (default: true)
      if (options.analyzeLPs !== false) {
        console.log("💧 Analyzing liquidity positions...");
        allTokens = await this.processLPTokens(allTokens, walletAddress);
      }
      
      // Step 5: Calculate totals
      const totalValue = allTokens.reduce((sum, t) => sum + (t.value || 0), 0);
      const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Generate LP summary
      const lpSummary = this.generateLPSummary(allTokens);
      
      console.log(`✅ Scan complete in ${scanTime} seconds!`);
      console.log(`📊 Found ${allTokens.length} tokens worth $${totalValue.toFixed(2)}`);
      
      if (lpSummary) {
        console.log(`💧 Liquidity Positions: ${lpSummary.count} worth $${lpSummary.totalValue.toFixed(2)}`);
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
      console.error("❌ Enhanced scan failed:", error);
      throw error;
    }
  }

  // Get tokens from PulseChain API
  private async getTokensFromAPI(walletAddress: string): Promise<any[]> {
    try {
      const url = `https://api.scan.pulsechain.com/api/v2/addresses/${walletAddress}/token-balances`;
      const response = await fetch(url);
      const data = await response.json();
      
      // Handle both array response and object with items
      const items = Array.isArray(data) ? data : (data.items || []);
      
      if (!items || items.length === 0) return [];
      
      return items
        .filter((item: any) => {
          // Filter out zero balances and blacklisted tokens
          if (!item.value || item.value === "0") return false;
          if (BLACKLISTED_TOKENS.has(item.token.address.toLowerCase())) {
            console.log(`Filtering out blacklisted token: ${item.token.address} (${item.token.symbol})`);
            return false;
          }
          return true;
        })
        .map((item: any) => ({
          address: item.token.address.toLowerCase(),
          symbol: item.token.symbol || "Unknown",
          name: item.token.name || "Unknown",
          decimals: parseInt(item.token.decimals) || 18,
          balance: ethers.BigNumber.from(item.value)
        }));
    } catch (error) {
      console.error("API error:", error);
      return [];
    }
  }

  // Get tokens from recent blockchain activity
  private async getRecentTokens(walletAddress: string): Promise<any[]> {
    try {
      return await executeWithFailover(async (provider) => {
        const currentBlock = await provider.getBlockNumber();
        // Scan last 2000 blocks (~10 minutes) for very recent activity
        const fromBlock = currentBlock - 2000;
        
        // Normalize address for log filtering
        const normalizedAddress = ethers.utils.getAddress(walletAddress);
        const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
        const addressTopic = ethers.utils.hexZeroPad(normalizedAddress, 32);
        
        // Get both incoming AND outgoing transfers to catch all activity
        const [incomingLogs, outgoingLogs] = await Promise.all([
          provider.getLogs({
            fromBlock,
            toBlock: currentBlock,
            topics: [transferTopic, null, addressTopic] // TO this address
          }),
          provider.getLogs({
            fromBlock,
            toBlock: currentBlock,
            topics: [transferTopic, addressTopic, null] // FROM this address
          })
        ]);
        
        // Combine and extract unique token addresses
        const allLogs = [...incomingLogs, ...outgoingLogs];
        const tokenSet = new Set(allLogs.map(log => log.address.toLowerCase()));
        
        console.log(`Found ${tokenSet.size} tokens with recent activity in last ${currentBlock - fromBlock} blocks`);
        
        // For each token, fetch current balance to ensure we have latest data
        const tokensWithBalances = await Promise.all(
          Array.from(tokenSet).map(async (address) => {
            try {
              const contract = new ethers.Contract(address, [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)',
                'function symbol() view returns (string)',
                'function name() view returns (string)'
              ], provider);
              
              const [balance, decimals, symbol, name] = await Promise.all([
                contract.balanceOf(walletAddress),
                contract.decimals().catch(() => 18),
                contract.symbol().catch(() => 'UNKNOWN'),
                contract.name().catch(() => 'Unknown Token')
              ]);
              
              return {
                address,
                symbol,
                name,
                decimals,
                balance: balance
              };
            } catch (error) {
              console.error(`Error fetching data for recent token ${address}:`, error);
              return { address };
            }
          })
        );
        
        return tokensWithBalances;
      });
    } catch (error) {
      console.error("Recent activity error:", error);
      return [];
    }
  }

  // Process tokens: get balances and prices
  private async processTokens(tokenList: any[], walletAddress: string): Promise<ProcessedToken[]> {
    // Remove duplicates
    const uniqueTokens = new Map();
    tokenList.forEach(token => {
      if (!uniqueTokens.has(token.address)) {
        uniqueTokens.set(token.address, token);
      }
    });

    // Always get fresh native PLS balance from blockchain (not from API cache)
    const { plsBalance, plsAmount } = await executeWithFailover(async (provider) => {
      const balance = await provider.getBalance(walletAddress);
      const amount = parseFloat(ethers.utils.formatEther(balance));
      console.log(`Fresh PLS balance for ${walletAddress}: ${amount} PLS`);
      return { plsBalance: balance, plsAmount: amount };
    });
    
    const processedTokens: ProcessedToken[] = [];
    
    // Add PLS if has balance
    if (plsAmount > 0) {
      console.log("  Getting WPLS price...");
      const wplsPrice = await this.getWPLSPrice();
      console.log(`  WPLS price: $${wplsPrice}`);
      processedTokens.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: "PLS",
        name: "PulseChain",
        decimals: PLS_DECIMALS,
        balance: plsBalance.toString(),
        balanceFormatted: plsAmount,
        price: wplsPrice,
        value: plsAmount * wplsPrice,
        isNative: true,
        verified: true
      });
    }

    // Process tokens in parallel batches
    const tokenArray = Array.from(uniqueTokens);
    const BATCH_SIZE = 10; // Process 10 tokens at a time
    
    for (let i = 0; i < tokenArray.length; i += BATCH_SIZE) {
      const batch = tokenArray.slice(i, i + BATCH_SIZE);
      console.log(`  Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(tokenArray.length/BATCH_SIZE)} (${batch.length} tokens)...`);
      
      const batchResults = await Promise.all(
        batch.map(async ([address, tokenInfo]) => {
          try {
            // Skip blacklisted tokens
            if (BLACKLISTED_TOKENS.has(address.toLowerCase())) {
              console.log(`Skipping blacklisted token during processing: ${address}`);
              return null;
            }
            const processed = await this.processToken(address, tokenInfo, walletAddress);
            return processed;
          } catch (error) {
            console.error(`Failed to process token ${address}:`, error);
            return null;
          }
        })
      );
      
      // Add successful results to processedTokens
      for (const result of batchResults) {
        if (result && result.balanceFormatted > 0) {
          processedTokens.push(result);
        }
      }
    }

    // Sort by value
    return processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
  }

  // Process a single token
  private async processToken(tokenAddress: string, tokenInfo: any, walletAddress: string): Promise<ProcessedToken | null> {
    return await executeWithFailover(async (provider) => {
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
        tokenInfo.decimals !== undefined ? tokenInfo.decimals : contract.decimals().catch(() => 18)
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
          balance: balance.toString(),
          balanceFormatted: amount,
          price: wplsPrice,
          value: amount * wplsPrice,
          verified: true
        };
      }
      
      // Get price for other tokens
      const priceData = await this.getTokenPrice(tokenAddress, decimals);
      
      return {
        address: tokenAddress,
        symbol,
        name,
        decimals,
        balance: balance.toString(),
        balanceFormatted: amount,
        price: priceData.price || 0,
        value: amount * (priceData.price || 0)
      };
    });
  }

  // Get token price from liquidity pools
  async getTokenPrice(tokenAddress: string, decimals: number): Promise<{ price: number; hasPrice: boolean; liquidity: number }> {
    // Check cache
    const cached = this.cache.get(tokenAddress);
    if (cached && Date.now() - cached.time < 300000) { // 5 min cache
      return cached.data;
    }

    try {
      const wplsPrice = await this.getWPLSPrice();
      
      return await executeWithFailover(async (provider) => {
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
      
      // No valid pair found
      return { price: 0, hasPrice: false, liquidity: 0 };
    });
    } catch (error) {
      console.error(`Price fetch failed for ${tokenAddress}:`, error);
      return { price: 0, hasPrice: false, liquidity: 0 };
    }
  }

  // Get WPLS price from stablecoin pairs
  async getWPLSPrice(): Promise<number> {
    // Check cache
    const cached = this.cache.get('wpls-price');
    if (cached && Date.now() - cached.time < 60000) { // 1 min cache
      return cached.data;
    }

    try {
      return await executeWithFailover(async (provider) => {
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
    });
    } catch (error) {
      return 0.000032; // Fallback price
    }
  }

  // Check if a token is a liquidity pair
  private async isLiquidityPair(tokenAddress: string, tokenInfo: any): Promise<boolean> {
    // PLP tokens usually have specific patterns
    const symbol = tokenInfo.symbol || "";
    const name = tokenInfo.name || "";
    
    // Check common LP token indicators
    if (symbol.includes("PLP") || 
        symbol.includes("-LP") || 
        name.includes("PulseX LP") ||
        name.includes("Liquidity")) {
      return true;
    }
    
    // Additional check: LP tokens have specific methods
    try {
      return await executeWithFailover(async (provider) => {
        const pairContract = new ethers.Contract(
          tokenAddress,
          [
            "function token0() view returns (address)",
            "function token1() view returns (address)",
            "function getReserves() view returns (uint112, uint112, uint32)"
          ],
          provider
        );
        
        // Try to call token0() - if it works, it's likely a pair
        await pairContract.token0();
        return true;
      });
    } catch (error) {
      return false;
    }
  }

  // Analyze a liquidity pair token
  private async analyzeLPToken(lpTokenAddress: string, lpBalance: ethers.BigNumber, walletAddress: string): Promise<LPTokenInfo | null> {
    try {
      console.log(`\n🔍 Analyzing LP token: ${lpTokenAddress}`);
      
      return await executeWithFailover(async (provider) => {
        // LP token contract
        const lpContract = new ethers.Contract(
          lpTokenAddress,
          [
            "function token0() view returns (address)",
            "function token1() view returns (address)",
            "function getReserves() view returns (uint112, uint112, uint32)",
            "function totalSupply() view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)",
            "function name() view returns (string)",
            "function balanceOf(address) view returns (uint256)"
          ],
          provider
        );

        // Get LP token info
        const [token0Address, token1Address, reserves, totalSupply, lpDecimals, lpSymbol, lpName] = await Promise.all([
          lpContract.token0(),
          lpContract.token1(),
          lpContract.getReserves(),
          lpContract.totalSupply(),
          lpContract.decimals().catch(() => 18),
          lpContract.symbol().catch(() => "PLP"),
          lpContract.name().catch(() => "PulseX LP Token")
        ]);

        // If no balance was provided, get it
        if (!lpBalance || lpBalance.eq(0)) {
          lpBalance = await lpContract.balanceOf(walletAddress);
        }

        // If still no balance, return null
        if (lpBalance.eq(0)) {
          console.log(`  No balance for LP token ${lpTokenAddress}`);
          return null;
        }

        // Get info about the underlying tokens
        const [token0Info, token1Info] = await Promise.all([
          this.getTokenInfo(token0Address),
          this.getTokenInfo(token1Address)
        ]);

        console.log(`  Pair: ${token0Info.symbol}/${token1Info.symbol}`);
        console.log(`  LP Balance: ${ethers.utils.formatUnits(lpBalance, lpDecimals)}`);
        console.log(`  Total Supply: ${ethers.utils.formatUnits(totalSupply, lpDecimals)}`);

        // Calculate user's share of the pool
        const userLPAmount = parseFloat(ethers.utils.formatUnits(lpBalance, lpDecimals));
        const totalLPSupply = parseFloat(ethers.utils.formatUnits(totalSupply, lpDecimals));
        
        // Prevent division by zero
        if (totalLPSupply === 0) {
          console.log(`  Total supply is 0, cannot calculate share`);
          return null;
        }
        
        const userSharePercent = (userLPAmount / totalLPSupply) * 100;

        // Calculate amounts of each token in the pool
        const reserve0 = parseFloat(ethers.utils.formatUnits(reserves[0], token0Info.decimals));
        const reserve1 = parseFloat(ethers.utils.formatUnits(reserves[1], token1Info.decimals));

        console.log(`  Pool reserves: ${reserve0} ${token0Info.symbol} / ${reserve1} ${token1Info.symbol}`);

        // User's share of each token
        const userToken0Amount = (userLPAmount / totalLPSupply) * reserve0;
        const userToken1Amount = (userLPAmount / totalLPSupply) * reserve1;

        // Get prices for the tokens
        const [token0Price, token1Price] = await Promise.all([
          this.getTokenPriceForLP(token0Address, token0Info),
          this.getTokenPriceForLP(token1Address, token1Info)
        ]);

        // Calculate values
        const token0Value = userToken0Amount * token0Price;
        const token1Value = userToken1Amount * token1Price;
        const totalValue = token0Value + token1Value;

        console.log(`  Your share: ${userSharePercent.toFixed(4)}% of pool`);
        console.log(`  Token 0: ${userToken0Amount.toFixed(4)} ${token0Info.symbol} ($${token0Value.toFixed(2)})`);
        console.log(`  Token 1: ${userToken1Amount.toFixed(4)} ${token1Info.symbol} ($${token1Value.toFixed(2)})`);
        console.log(`  Total LP Value: $${totalValue.toFixed(2)}`);

        return {
          address: lpTokenAddress,
          symbol: lpSymbol,
          name: lpName,
          decimals: lpDecimals,
          amount: userLPAmount,
          balance: lpBalance,
          isLiquidityPair: true,
          
          // LP specific data
          pairInfo: {
            token0: {
              address: token0Address,
              symbol: token0Info.symbol,
              name: token0Info.name,
              amount: userToken0Amount,
              price: token0Price,
              value: token0Value
            },
            token1: {
              address: token1Address,
              symbol: token1Info.symbol,
              name: token1Info.name,
              amount: userToken1Amount,
              price: token1Price,
              value: token1Value
            },
            userSharePercent,
            totalReserves: {
              token0: reserve0,
              token1: reserve1
            }
          },
          
          // Standard token fields
          price: totalValue / userLPAmount, // Price per LP token
          value: totalValue,
          hasPrice: true,
          liquidity: token0Value + token1Value // Same as total value for LP tokens
        };
      });
    } catch (error) {
      console.error(`Failed to analyze LP token ${lpTokenAddress}:`, error);
      return null;
    }
  }

  // Get token info
  private async getTokenInfo(tokenAddress: string): Promise<{ symbol: string; name: string; decimals: number }> {
    try {
      return await executeWithFailover(async (provider) => {
        const contract = new ethers.Contract(
          tokenAddress,
          [
            "function symbol() view returns (string)",
            "function name() view returns (string)",
            "function decimals() view returns (uint8)"
          ],
          provider
        );

        const [symbol, name, decimals] = await Promise.all([
          contract.symbol().catch(() => "Unknown"),
          contract.name().catch(() => "Unknown"),
          contract.decimals().catch(() => 18)
        ]);

        return { symbol, name, decimals };
      });
    } catch (error) {
      return { symbol: "Unknown", name: "Unknown", decimals: 18 };
    }
  }

  // Get token price using main scanner logic
  private async getTokenPriceForLP(tokenAddress: string, tokenInfo: { symbol: string; name: string; decimals: number }): Promise<number> {
    // Special case for WPLS
    if (tokenAddress.toLowerCase() === WPLS_ADDRESS.toLowerCase()) {
      return await this.getWPLSPrice();
    }

    // Use main scanner's price lookup
    const priceData = await this.getTokenPrice(tokenAddress, tokenInfo.decimals);
    return priceData.price || 0;
  }

  // Process all LP tokens in a token list
  private async processLPTokens(tokens: ProcessedToken[], walletAddress: string): Promise<ProcessedToken[]> {
    const BATCH_SIZE = 5; // Process 5 LP tokens at a time
    const processedTokens: ProcessedToken[] = [];
    
    // First, check which tokens are LP tokens in parallel
    console.log(`\n  Checking ${tokens.length} tokens for LP pairs...`);
    const lpCheckResults = await Promise.all(
      tokens.map(async (token) => ({
        token,
        isLp: await this.isLiquidityPair(token.address, token)
      }))
    );
    
    const lpTokens = lpCheckResults.filter(r => r.isLp).map(r => r.token);
    const nonLpTokens = lpCheckResults.filter(r => !r.isLp).map(r => r.token);
    
    console.log(`  Found ${lpTokens.length} LP tokens`);
    
    // Add non-LP tokens immediately
    processedTokens.push(...nonLpTokens);
    
    // Process LP tokens in batches
    for (let i = 0; i < lpTokens.length; i += BATCH_SIZE) {
      const batch = lpTokens.slice(i, i + BATCH_SIZE);
      console.log(`  Processing LP batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(lpTokens.length/BATCH_SIZE)} (${batch.length} tokens)...`);
      
      const batchResults = await Promise.all(
        batch.map(async (token) => {
          // Make sure we have the balance
          let balance = ethers.BigNumber.from(token.balance || "0");
          
          // Skip if balance is 0
          if (balance.eq(0)) {
            console.log(`  Skipping LP token with zero balance: ${token.symbol}`);
            return { ...token, isLp: true };
          }
          
          // Analyze it
          const lpAnalysis = await this.analyzeLPToken(
            token.address, 
            balance,
            walletAddress
          );
          
          if (lpAnalysis) {
            // Merge existing token data with LP analysis
            const enhancedToken: ProcessedToken = {
              ...token,
              symbol: lpAnalysis.symbol,
              name: lpAnalysis.name,
              decimals: lpAnalysis.decimals,
              balanceFormatted: lpAnalysis.amount,
              price: lpAnalysis.price,
              value: lpAnalysis.value,
              isLp: true,
              // Map LP analysis to existing LP fields
              lpToken0Symbol: lpAnalysis.pairInfo?.token0.symbol,
              lpToken1Symbol: lpAnalysis.pairInfo?.token1.symbol,
              lpToken0Name: lpAnalysis.pairInfo?.token0.name,
              lpToken1Name: lpAnalysis.pairInfo?.token1.name,
              lpToken0Address: lpAnalysis.pairInfo?.token0.address,
              lpToken1Address: lpAnalysis.pairInfo?.token1.address,
              lpToken0BalanceFormatted: lpAnalysis.pairInfo?.token0.amount,
              lpToken1BalanceFormatted: lpAnalysis.pairInfo?.token1.amount,
              lpToken0Price: lpAnalysis.pairInfo?.token0.price,
              lpToken1Price: lpAnalysis.pairInfo?.token1.price,
              lpToken0Value: lpAnalysis.pairInfo?.token0.value,
              lpToken1Value: lpAnalysis.pairInfo?.token1.value
            };
            // Store the full pairInfo for later use
            (enhancedToken as any).lpDetails = lpAnalysis.pairInfo;
            return enhancedToken;
          } else {
            // If analysis failed, keep original token data
            return { ...token, isLp: true };
          }
        })
      );
      
      // Add batch results
      processedTokens.push(...batchResults);
    }
    
    return processedTokens;
  }

  // Generate LP summary for reports
  private generateLPSummary(tokens: ProcessedToken[]): any {
    const lpTokens = tokens.filter(t => t.isLp);
    
    if (lpTokens.length === 0) return null;
    
    const totalLPValue = lpTokens.reduce((sum, lp) => sum + (lp.value || 0), 0);
    
    const summary = {
      count: lpTokens.length,
      totalValue: totalLPValue,
      positions: lpTokens.map(lp => {
        const lpDetails = (lp as any).lpDetails;
        if (!lpDetails) {
          return {
            pair: `${lp.symbol}`,
            value: lp.value || 0,
            sharePercent: 0,
            token0Value: 0,
            token1Value: 0
          };
        }
        
        return {
          pair: `${lpDetails.token0.symbol}/${lpDetails.token1.symbol}`,
          value: lp.value || 0,
          sharePercent: lpDetails.userSharePercent,
          token0Value: lpDetails.token0.value,
          token1Value: lpDetails.token1.value
        };
      })
    };
    
    return summary;
  }
}

// Export a singleton instance
export const enhancedScanner = new EnhancedPulseChainScanner();