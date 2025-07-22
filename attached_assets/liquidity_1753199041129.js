// liquidity.js - Analyzes PulseX liquidity pair (PLP) tokens
const { ethers } = require("ethers");

class LiquidityAnalyzer {
  constructor(scanner) {
    this.scanner = scanner; // Reference to main scanner for price lookups
    this.pairCache = new Map();
  }

  // Check if a token is a liquidity pair
  async isLiquidityPair(tokenAddress, tokenInfo) {
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
      const provider = this.scanner.getProvider();
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
    } catch (error) {
      return false;
    }
  }

  // Analyze a liquidity pair token
  async analyzeLPToken(lpTokenAddress, lpBalance, walletAddress) {
    try {
      console.log(`\n🔍 Analyzing LP token: ${lpTokenAddress}`);
      
      const provider = this.scanner.getProvider();
      
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
        this.getTokenPrice(token0Address, token0Info),
        this.getTokenPrice(token1Address, token1Info)
      ]);

      // Calculate values
      const token0Value = userToken0Amount * token0Price;
      const token1Value = userToken1Amount * token1Price;
      const totalValue = token0Value + token1Value;

      console.log(`  Your share: ${userSharePercent.toFixed(4)}% of pool`);
      console.log(`  Token 0: ${userToken0Amount.toFixed(4)} ${token0Info.symbol} (${token0Value.toFixed(2)})`);
      console.log(`  Token 1: ${userToken1Amount.toFixed(4)} ${token1Info.symbol} (${token1Value.toFixed(2)})`);
      console.log(`  Total LP Value: ${totalValue.toFixed(2)}`);

      return {
        address: lpTokenAddress,
        symbol: lpSymbol,
        name: lpName,
        decimals: lpDecimals,
        amount: userLPAmount,
        balance: lpBalance, // Keep the BigNumber balance
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

    } catch (error) {
      console.error(`Failed to analyze LP token ${lpTokenAddress}:`, error.message);
      return null;
    }
  }

  // Get token info
  async getTokenInfo(tokenAddress) {
    try {
      const provider = this.scanner.getProvider();
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
    } catch (error) {
      return { symbol: "Unknown", name: "Unknown", decimals: 18 };
    }
  }

  // Get token price using main scanner
  async getTokenPrice(tokenAddress, tokenInfo) {
    // Special case for WPLS
    if (tokenAddress.toLowerCase() === "0xa1077a294dde1b09bb078844df40758a5d0f9a27") {
      return await this.scanner.getWPLSPrice();
    }

    // Use main scanner's price lookup
    const priceData = await this.scanner.getTokenPrice(tokenAddress, tokenInfo.decimals);
    return priceData.price || 0;
  }

  // Fixed method to safely handle small decimal values
  safeParseUnits(value, decimals) {
    try {
      // Handle very small numbers that might be in scientific notation
      if (typeof value === 'number' && value < 1e-15) {
        // If the value is extremely small, just return 0
        return ethers.BigNumber.from(0);
      }
      
      // Convert to string and handle scientific notation
      let valueStr = value.toString();
      
      // If it's in scientific notation, convert to fixed notation
      if (valueStr.includes('e-') || valueStr.includes('E-')) {
        const num = parseFloat(valueStr);
        // If the number is too small, treat as 0
        if (num < 1e-15) {
          return ethers.BigNumber.from(0);
        }
        // Convert to fixed notation with enough precision
        valueStr = num.toFixed(20).replace(/\.?0+$/, '');
      }
      
      return ethers.utils.parseUnits(valueStr, decimals);
    } catch (error) {
      console.log(`Warning: Could not parse units for value ${value}, treating as 0`);
      return ethers.BigNumber.from(0);
    }
  }

  // Process all LP tokens in a token list
  async processLPTokens(tokens, walletAddress) {
    const processedTokens = [];
    
    for (const token of tokens) {
      // Check if it's an LP token
      if (await this.isLiquidityPair(token.address, token)) {
        console.log(`\n💧 Found LP token: ${token.symbol}`);
        
        // Make sure we have the balance
        let balance = token.balance;
        if (!balance && token.amount) {
          // Convert amount back to BigNumber if we only have the parsed amount
          const decimals = token.decimals || 18;
          // Use the safe parsing method to handle small numbers
          balance = this.safeParseUnits(token.amount, decimals);
        }
        
        // Skip if balance is 0 or null
        if (!balance || balance.eq(0)) {
          console.log(`  Skipping LP token with zero balance: ${token.symbol}`);
          processedTokens.push(token);
          continue;
        }
        
        // Analyze it
        const lpAnalysis = await this.analyzeLPToken(
          token.address, 
          balance,
          walletAddress
        );
        
        if (lpAnalysis) {
          // Merge existing token data with LP analysis
          processedTokens.push({
            ...token,
            ...lpAnalysis
          });
        } else {
          // If analysis failed, keep original token data
          processedTokens.push(token);
        }
      } else {
        // Not an LP token, keep as is
        processedTokens.push(token);
      }
    }
    
    return processedTokens;
  }

  // Generate LP summary for reports
  static generateLPSummary(tokens) {
    const lpTokens = tokens.filter(t => t.isLiquidityPair);
    
    if (lpTokens.length === 0) return null;
    
    const totalLPValue = lpTokens.reduce((sum, lp) => sum + lp.value, 0);
    
    const summary = {
      count: lpTokens.length,
      totalValue: totalLPValue,
      positions: lpTokens.map(lp => ({
        pair: `${lp.pairInfo.token0.symbol}/${lp.pairInfo.token1.symbol}`,
        value: lp.value,
        sharePercent: lp.pairInfo.userSharePercent,
        token0Value: lp.pairInfo.token0.value,
        token1Value: lp.pairInfo.token1.value
      }))
    };
    
    return summary;
  }
}

module.exports = LiquidityAnalyzer;