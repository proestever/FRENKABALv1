// multi-wallet-scanner.js - Scan multiple wallets and combine them into one portfolio
const PulseChainScanner = require('./scanner');
const ReportGenerator = require('./report');

class MultiWalletScanner {
  constructor() {
    this.scanner = new PulseChainScanner();
  }

  // Main method to scan multiple wallets
  async scanMultipleWallets(walletAddresses, options = {}) {
    console.log(`\n🚀 Multi-Wallet Portfolio Scanner`);
    console.log(`📊 Scanning ${walletAddresses.length} wallets...\n`);
    
    const startTime = Date.now();
    const walletResults = [];
    const combinedTokens = new Map(); // Use Map to combine tokens by address
    let totalPortfolioValue = 0;
    let totalTokenCount = 0;
    const combinedLPPositions = [];

    // Scan each wallet
    for (let i = 0; i < walletAddresses.length; i++) {
      const wallet = walletAddresses[i];
      console.log(`\n[${i + 1}/${walletAddresses.length}] Scanning: ${wallet}`);
      console.log(`${'='.repeat(50)}`);
      
      try {
        const result = await this.scanner.scan(wallet, options);
        walletResults.push(result);
        
        console.log(`✅ Wallet ${i + 1}: $${result.totalValue.toFixed(2)} (${result.tokenCount} tokens)`);
        
        // Add to totals
        totalPortfolioValue += result.totalValue;
        totalTokenCount += result.tokenCount;
        
        // Combine tokens
        this.combineTokens(result.tokens, combinedTokens, wallet);
        
        // Collect LP positions
        if (result.lpSummary) {
          result.lpSummary.positions.forEach(lp => {
            combinedLPPositions.push({
              ...lp,
              wallet: wallet.slice(0, 8) + '...'
            });
          });
        }
        
      } catch (error) {
        console.error(`❌ Failed to scan wallet ${wallet}:`, error.message);
        walletResults.push({ 
          address: wallet, 
          error: error.message, 
          totalValue: 0, 
          tokenCount: 0 
        });
      }
    }

    // Convert combined tokens map to array and sort by total value
    const finalTokens = Array.from(combinedTokens.values())
      .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));

    // Calculate final scan time
    const scanDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Create combined LP summary
    const combinedLPSummary = this.createCombinedLPSummary(finalTokens, combinedLPPositions);

    // Print summary
    this.printPortfolioSummary(walletResults, finalTokens, combinedLPSummary, scanDuration);

    // Return combined result
    const combinedResult = {
      wallets: walletAddresses,
      walletResults,
      tokens: finalTokens,
      totalValue: totalPortfolioValue,
      tokenCount: finalTokens.length,
      scanDuration,
      lpSummary: combinedLPSummary,
      individualWalletCount: walletAddresses.length
    };

    return combinedResult;
  }

  // Combine tokens from different wallets
  combineTokens(tokens, combinedTokens, walletAddress) {
    tokens.forEach(token => {
      const key = token.address.toLowerCase();
      
      if (combinedTokens.has(key)) {
        // Token already exists, combine the amounts
        const existing = combinedTokens.get(key);
        
        existing.amount += token.amount;
        existing.totalValue += (token.value || 0);
        existing.walletCount += 1;
        existing.wallets.push({
          address: walletAddress.slice(0, 8) + '...',
          amount: token.amount,
          value: token.value || 0
        });
        
        // If it's an LP token, combine LP data
        if (token.isLiquidityPair && token.pairInfo) {
          existing.combinedLPData.token0Amount += token.pairInfo.token0.amount;
          existing.combinedLPData.token1Amount += token.pairInfo.token1.amount;
          existing.combinedLPData.token0Value += token.pairInfo.token0.value;
          existing.combinedLPData.token1Value += token.pairInfo.token1.value;
          existing.combinedLPData.totalSharePercent += token.pairInfo.userSharePercent;
        }
        
      } else {
        // New token, add it
        const newToken = {
          ...token,
          totalValue: token.value || 0,
          walletCount: 1,
          wallets: [{
            address: walletAddress.slice(0, 8) + '...',
            amount: token.amount,
            value: token.value || 0
          }]
        };
        
        // If it's an LP token, set up combined LP data
        if (token.isLiquidityPair && token.pairInfo) {
          newToken.combinedLPData = {
            token0Amount: token.pairInfo.token0.amount,
            token1Amount: token.pairInfo.token1.amount,
            token0Value: token.pairInfo.token0.value,
            token1Value: token.pairInfo.token1.value,
            totalSharePercent: token.pairInfo.userSharePercent
          };
        }
        
        combinedTokens.set(key, newToken);
      }
    });
  }

  // Create combined LP summary
  createCombinedLPSummary(tokens, lpPositions) {
    const lpTokens = tokens.filter(t => t.isLiquidityPair);
    
    if (lpTokens.length === 0) return null;
    
    const totalLPValue = lpTokens.reduce((sum, lp) => sum + lp.totalValue, 0);
    
    return {
      count: lpTokens.length,
      totalValue: totalLPValue,
      positions: lpTokens.map(lp => ({
        pair: lp.pairInfo ? `${lp.pairInfo.token0.symbol}/${lp.pairInfo.token1.symbol}` : 'Unknown',
        totalValue: lp.totalValue,
        walletCount: lp.walletCount,
        combinedSharePercent: lp.combinedLPData ? lp.combinedLPData.totalSharePercent : 0,
        token0Value: lp.combinedLPData ? lp.combinedLPData.token0Value : 0,
        token1Value: lp.combinedLPData ? lp.combinedLPData.token1Value : 0
      }))
    };
  }

  // Print portfolio summary
  printPortfolioSummary(walletResults, tokens, lpSummary, scanDuration) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏆 COMBINED PORTFOLIO SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    
    // Wallet breakdown
    console.log(`\n📊 Individual Wallets:`);
    walletResults.forEach((result, i) => {
      if (result.error) {
        console.log(`   ${i + 1}. ${result.address.slice(0, 8)}... ❌ Error: ${result.error}`);
      } else {
        console.log(`   ${i + 1}. ${result.address.slice(0, 8)}... $${result.totalValue.toFixed(2)} (${result.tokenCount} tokens)`);
      }
    });

    // Overall stats
    const totalValue = tokens.reduce((sum, t) => sum + t.totalValue, 0);
    console.log(`\n💰 Portfolio Totals:`);
    console.log(`   Total Value: $${totalValue.toFixed(2)}`);
    console.log(`   Unique Tokens: ${tokens.length}`);
    console.log(`   Wallets Scanned: ${walletResults.length}`);
    console.log(`   Scan Time: ${scanDuration}s`);

    // LP Summary
    if (lpSummary) {
      console.log(`\n💧 Liquidity Positions:`);
      console.log(`   LP Tokens: ${lpSummary.count}`);
      console.log(`   LP Value: $${lpSummary.totalValue.toFixed(2)}`);
      console.log(`   LP % of Portfolio: ${((lpSummary.totalValue / totalValue) * 100).toFixed(1)}%`);
    }

    // Top 10 holdings
    console.log(`\n🏅 Top 10 Combined Holdings:`);
    tokens.slice(0, 10).forEach((token, i) => {
      const walletText = token.walletCount > 1 ? ` (${token.walletCount} wallets)` : '';
      if (token.isLiquidityPair) {
        const pair = token.pairInfo ? `${token.pairInfo.token0.symbol}/${token.pairInfo.token1.symbol}` : token.symbol;
        console.log(`   ${i + 1}. ${pair} LP: $${token.totalValue.toFixed(2)}${walletText}`);
      } else {
        console.log(`   ${i + 1}. ${token.symbol}: $${token.totalValue.toFixed(2)} (${token.amount.toLocaleString()})${walletText}`);
      }
    });
  }

  // Save combined reports
  saveCombinedReports(combinedResult, baseFilename) {
    if (!baseFilename) {
      const timestamp = Date.now();
      baseFilename = `multi_wallet_portfolio_${timestamp}`;
    }

    // Generate modified report data for combined portfolio
    const reportData = {
      address: `Combined Portfolio (${combinedResult.wallets.length} wallets)`,
      tokens: combinedResult.tokens,
      totalValue: combinedResult.totalValue,
      tokenCount: combinedResult.tokenCount,
      scanDuration: combinedResult.scanDuration,
      lpSummary: combinedResult.lpSummary,
      
      // Additional multi-wallet data
      walletBreakdown: combinedResult.walletResults.map(result => ({
        address: result.address,
        value: result.totalValue || 0,
        tokenCount: result.tokenCount || 0,
        error: result.error || null
      }))
    };

    // Use the existing report generator but with enhanced data
    const files = ReportGenerator.saveReports(reportData, baseFilename);
    
    // Save additional multi-wallet specific report
    this.saveDetailedMultiWalletReport(combinedResult, baseFilename);
    
    return files;
  }

  // Save detailed multi-wallet report
  saveDetailedMultiWalletReport(combinedResult, baseFilename) {
    const fs = require('fs');
    
    const detailedReport = {
      scanTime: new Date().toISOString(),
      portfolioSummary: {
        totalWallets: combinedResult.wallets.length,
        totalValue: combinedResult.totalValue,
        totalUniqueTokens: combinedResult.tokenCount,
        scanDuration: combinedResult.scanDuration
      },
      walletBreakdown: combinedResult.walletResults.map(result => ({
        address: result.address,
        totalValue: result.totalValue || 0,
        tokenCount: result.tokenCount || 0,
        topTokens: result.tokens ? result.tokens.slice(0, 5).map(t => ({
          symbol: t.symbol,
          value: t.value || 0
        })) : [],
        error: result.error || null
      })),
      combinedTokens: combinedResult.tokens.map(token => ({
        symbol: token.symbol,
        totalAmount: token.amount,
        totalValue: token.totalValue,
        walletCount: token.walletCount,
        walletBreakdown: token.wallets,
        isLP: token.isLiquidityPair || false,
        lpData: token.combinedLPData || null
      })),
      lpSummary: combinedResult.lpSummary
    };

    const filename = `${baseFilename}_detailed.json`;
    fs.writeFileSync(filename, JSON.stringify(detailedReport, null, 2));
    console.log(`📈 Detailed multi-wallet report saved to: ${filename}`);
  }
}

// Example usage and main function
async function main() {
  const scanner = new MultiWalletScanner();
  
  // Example wallet addresses - replace with your actual addresses
  const wallets = [
    "0x9Be83826AFDf22a88027f8e5b79f428178bd9635",
    "0xF3fAE8675073E9590E89E90377B0Bad96cC7DFed",
    // Add more wallet addresses here
  ];
  
  try {
    // Scan all wallets
    const result = await scanner.scanMultipleWallets(wallets, {
      analyzeLPs: true // Enable LP analysis
    });
    
    // Save combined reports
    scanner.saveCombinedReports(result);
    
    console.log(`\n🎉 Multi-wallet scan complete!`);
    console.log(`💎 Total Portfolio Value: $${result.totalValue.toFixed(2)}`);
    
  } catch (error) {
    console.error("❌ Multi-wallet scan failed:", error);
  }
}

// Advanced usage examples
class AdvancedMultiWalletUsage {
  
  // Scan wallets with custom filtering
  static async scanWithFilters(wallets, minValue = 100) {
    const scanner = new MultiWalletScanner();
    const result = await scanner.scanMultipleWallets(wallets);
    
    // Filter tokens worth more than minValue
    const valuableTokens = result.tokens.filter(t => t.totalValue >= minValue);
    
    console.log(`\n💎 Tokens worth more than $${minValue}:`);
    valuableTokens.forEach(token => {
      console.log(`   ${token.symbol}: $${token.totalValue.toFixed(2)} across ${token.walletCount} wallet(s)`);
    });
    
    return { ...result, valuableTokens };
  }
  
  // Compare portfolios over time
  static async comparePortfolios(wallets, previousResultFile) {
    const fs = require('fs');
    const scanner = new MultiWalletScanner();
    
    const currentResult = await scanner.scanMultipleWallets(wallets);
    
    try {
      const previousData = JSON.parse(fs.readFileSync(previousResultFile, 'utf8'));
      const valueChange = currentResult.totalValue - previousData.portfolioSummary.totalValue;
      const percentChange = (valueChange / previousData.portfolioSummary.totalValue) * 100;
      
      console.log(`\n📈 Portfolio Change Analysis:`);
      console.log(`   Previous Value: $${previousData.portfolioSummary.totalValue.toFixed(2)}`);
      console.log(`   Current Value: $${currentResult.totalValue.toFixed(2)}`);
      console.log(`   Change: ${valueChange > 0 ? '+' : ''}$${valueChange.toFixed(2)} (${percentChange.toFixed(2)}%)`);
      
    } catch (error) {
      console.log("No previous data found for comparison");
    }
    
    return currentResult;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🚀 Multi-Wallet PulseChain Scanner

Usage:
  node multi-wallet-scanner.js <wallet1> <wallet2> [wallet3] ...

Examples:
  node multi-wallet-scanner.js 0x123... 0x456...
  node multi-wallet-scanner.js 0x123... 0x456... 0x789...

Features:
  ✅ Combines multiple wallets into one portfolio view
  ✅ Aggregates token balances across wallets
  ✅ Analyzes LP positions from all wallets
  ✅ Generates comprehensive reports
  ✅ Shows which wallets hold each token
    `);
    process.exit(1);
  }
  
  // Run with provided wallet addresses
  main().catch(console.error);
}

module.exports = { MultiWalletScanner, AdvancedMultiWalletUsage };