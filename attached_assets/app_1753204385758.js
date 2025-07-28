// app.js - Simple examples of how to use the scanner
const PulseChainScanner = require('./scanner');
const ReportGenerator = require('./report');

// Example 1: Basic scan
async function basicScan() {
  const scanner = new PulseChainScanner();
  const wallet = "0xF3fAE8675073E9590E89E90377B0Bad96cC7DFed";
  
  try {
    // Scan the wallet
    const result = await scanner.scan(wallet);
    
    // Generate and save reports
    ReportGenerator.saveReports(result);
    
    // Show top holdings
    console.log("\n💎 Top 5 Holdings:");
    result.tokens.slice(0, 5).forEach((token, i) => {
      console.log(`${i + 1}. ${token.symbol}: $${token.value.toFixed(2)}`);
    });
    
  } catch (error) {
    console.error("Scan failed:", error);
  }
}

// Example 2: Scan multiple wallets (sequential)
async function scanMultipleWallets() {
  const scanner = new PulseChainScanner();
  
  const wallets = [
    "0xF3fAE8675073E9590E89E90377B0Bad96cC7DFed",
    "0x1234567890123456789012345678901234567890",
    // Add more wallets here
  ];
  
  let totalPortfolioValue = 0;
  
  for (const wallet of wallets) {
    try {
      console.log(`\nScanning wallet ${wallets.indexOf(wallet) + 1}/${wallets.length}`);
      const result = await scanner.scan(wallet);
      totalPortfolioValue += result.totalValue;
      
      // Save individual reports
      ReportGenerator.saveReports(result, `wallet_${wallets.indexOf(wallet) + 1}`);
      
    } catch (error) {
      console.error(`Failed to scan ${wallet}:`, error.message);
    }
  }
  
  console.log(`\n💰 Total Portfolio Value: $${totalPortfolioValue.toFixed(2)}`);
}

// Example 3: Watch a wallet for changes
async function watchWallet() {
  const scanner = new PulseChainScanner();
  const wallet = "0xF3fAE8675073E9590E89E90377B0Bad96cC7DFed";
  
  let lastValue = 0;
  
  console.log("👁️ Watching wallet for changes...");
  
  // Check every 5 minutes
  setInterval(async () => {
    try {
      const result = await scanner.scan(wallet);
      
      if (result.totalValue !== lastValue) {
        const change = result.totalValue - lastValue;
        const emoji = change > 0 ? "📈" : "📉";
        
        console.log(`\n${emoji} Value changed: ${change > 0 ? '+' : ''}$${change.toFixed(2)}`);
        console.log(`   New total: $${result.totalValue.toFixed(2)}`);
        
        lastValue = result.totalValue;
      }
    } catch (error) {
      console.error("Watch error:", error.message);
    }
  }, 300000); // 5 minutes
}

// Example 4: Custom token filter
async function scanWithFilter() {
  const scanner = new PulseChainScanner();
  const wallet = "0xF3fAE8675073E9590E89E90377B0Bad96cC7DFed";
  
  const result = await scanner.scan(wallet);
  
  // Filter tokens
  const valuableTokens = result.tokens.filter(t => t.value > 100);
  const stablecoins = result.tokens.filter(t => 
    ['USDC', 'USDT', 'DAI'].includes(t.symbol)
  );
  const noPrice = result.tokens.filter(t => !t.hasPrice);
  
  console.log(`\n📊 Token Analysis:`);
  console.log(`   Valuable tokens (>$100): ${valuableTokens.length}`);
  console.log(`   Stablecoins: ${stablecoins.length}`);
  console.log(`   Tokens without price: ${noPrice.length}`);
  
  // Generate custom report
  const customResult = {
    ...result,
    tokens: valuableTokens // Only include valuable tokens in report
  };
  
  ReportGenerator.saveReports(customResult, 'valuable_tokens_only');
}

// Example 5: Quick portfolio check - FIXED to handle multiple addresses
async function quickCheck() {
  const scanner = new PulseChainScanner();
  
  // Get wallet addresses from command line (can be multiple)
  const wallets = process.argv.slice(2);
  
  if (wallets.length === 0) {
    console.error("Usage: node app.js <wallet_address1> [wallet_address2] ...");
    return;
  }
  
  let totalPortfolioValue = 0;
  let totalTokenCount = 0;
  let allResults = [];
  
  console.log(`\n🚀 Quick Portfolio Check for ${wallets.length} wallet(s)\n`);
  
  // Scan each wallet
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    console.log(`[${i + 1}/${wallets.length}] Scanning: ${wallet.slice(0, 8)}...`);
    
    try {
      const result = await scanner.scan(wallet);
      allResults.push(result);
      
      totalPortfolioValue += result.totalValue;
      totalTokenCount += result.tokenCount;
      
      // Quick summary for this wallet
      console.log(`   ✅ $${result.totalValue.toFixed(2)} (${result.tokenCount} tokens)`);
      if (result.tokens[0]) {
        console.log(`   🏆 Top: ${result.tokens[0].symbol} ($${result.tokens[0].value.toFixed(2)})`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      allResults.push({ error: error.message, totalValue: 0, tokenCount: 0 });
    }
  }
  
  // Overall summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏆 PORTFOLIO SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  console.log(`💰 Total Value: $${totalPortfolioValue.toFixed(2)}`);
  console.log(`📊 Total Tokens: ${totalTokenCount}`);
  console.log(`🏠 Wallets: ${wallets.length}`);
  
  // Ask if user wants reports
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\nReport options:');
  console.log('1. Individual reports for each wallet');
  console.log('2. Combined report (all wallets merged)');
  console.log('3. Both individual and combined reports');
  console.log('4. No reports');
  
  readline.question('\nEnter option (1-4): ', (answer) => {
    const choice = parseInt(answer);
    
    if (choice === 1 || choice === 3) {
      // Generate individual reports
      allResults.forEach((result, i) => {
        if (!result.error) {
          ReportGenerator.saveReports(result, `wallet_${i + 1}_${wallets[i].slice(0, 8)}`);
        }
      });
    }
    
    if (choice === 2 || choice === 3) {
      // Generate combined report
      generateCombinedReport(allResults, wallets);
    }
    
    readline.close();
  });
}

// NEW: Quick multi-wallet scan (combines tokens)
async function quickMultiScan() {
  const scanner = new PulseChainScanner();
  const wallets = process.argv.slice(2);
  
  if (wallets.length === 0) {
    console.error("Usage: node app.js <wallet1> <wallet2> ...");
    return;
  }
  
  console.log(`\n🚀 Multi-Wallet Combined Scan\n`);
  
  const combinedTokens = new Map();
  let totalValue = 0;
  
  // Scan each wallet and combine tokens
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    console.log(`[${i + 1}/${wallets.length}] ${wallet.slice(0, 8)}...`);
    
    try {
      const result = await scanner.scan(wallet);
      totalValue += result.totalValue;
      
      // Combine tokens
      result.tokens.forEach(token => {
        const key = token.address.toLowerCase();
        if (combinedTokens.has(key)) {
          const existing = combinedTokens.get(key);
          existing.amount += token.amount;
          existing.value += token.value || 0;
          existing.walletCount += 1;
        } else {
          combinedTokens.set(key, {
            ...token,
            walletCount: 1
          });
        }
      });
      
    } catch (error) {
      console.error(`   ❌ ${error.message}`);
    }
  }
  
  // Convert to array and sort
  const finalTokens = Array.from(combinedTokens.values())
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  
  // Show results
  console.log(`\n💎 Combined Portfolio:`);
  console.log(`   Total Value: $${totalValue.toFixed(2)}`);
  console.log(`   Unique Tokens: ${finalTokens.length}`);
  
  console.log(`\n🏅 Top 10 Combined Holdings:`);
  finalTokens.slice(0, 10).forEach((token, i) => {
    const walletText = token.walletCount > 1 ? ` (${token.walletCount} wallets)` : '';
    console.log(`   ${i + 1}. ${token.symbol}: $${(token.value || 0).toFixed(2)}${walletText}`);
  });
}

// Main menu
async function main() {
  console.log(`
🚀 PulseChain Wallet Scanner
━━━━━━━━━━━━━━━━━━━━━━━━━━

Choose an option:
1. Basic scan (example wallet)
2. Scan multiple wallets (individual reports)
3. Watch wallet for changes
4. Scan with filters
5. Quick check (provide wallet addresses)
6. Quick multi-scan (combines tokens)

Press Ctrl+C to exit
`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Enter option (1-6): ', async (answer) => {
    switch(answer) {
      case '1':
        await basicScan();
        break;
      case '2':
        await scanMultipleWallets();
        break;
      case '3':
        await watchWallet();
        break;
      case '4':
        await scanWithFilter();
        break;
      case '5':
        readline.close();
        await quickCheck();
        return;
      case '6':
        readline.close();
        await quickMultiScan();
        return;
      default:
        console.log("Invalid option");
    }
    readline.close();
  });
}

// Run if called directly
if (require.main === module) {
  // If wallet addresses provided, do quick check
  if (process.argv[2]) {
    quickCheck();
  } else {
    main();
  }
}

// Function to generate combined report
function generateCombinedReport(allResults, wallets) {
  console.log('\n🔄 Generating combined report...');
  
  const combinedTokens = new Map();
  let totalPortfolioValue = 0;
  let totalLPValue = 0;
  const walletBreakdown = [];
  const combinedLPPositions = [];
  
  // Process each wallet result
  allResults.forEach((result, index) => {
    if (result.error) {
      walletBreakdown.push({
        address: wallets[index],
        totalValue: 0,
        tokenCount: 0,
        error: result.error
      });
      return;
    }
    
    totalPortfolioValue += result.totalValue;
    
    walletBreakdown.push({
      address: wallets[index],
      totalValue: result.totalValue,
      tokenCount: result.tokenCount,
      lpValue: result.lpSummary ? result.lpSummary.totalValue : 0
    });
    
    // Add LP positions to combined list
    if (result.lpSummary && result.lpSummary.positions) {
      result.lpSummary.positions.forEach(lp => {
        combinedLPPositions.push({
          ...lp,
          wallet: wallets[index].slice(0, 8) + '...',
          walletIndex: index
        });
      });
    }
    
    // Combine tokens
    result.tokens.forEach(token => {
      const key = token.address.toLowerCase();
      
      if (combinedTokens.has(key)) {
        const existing = combinedTokens.get(key);
        existing.amount += token.amount;
        existing.totalValue += (token.value || 0);
        existing.walletCount += 1;
        existing.wallets.push({
          address: wallets[index].slice(0, 8) + '...',
          amount: token.amount,
          value: token.value || 0,
          walletIndex: index
        });
        
        // Combine LP data if it's an LP token
        if (token.isLiquidityPair && token.pairInfo && existing.combinedLPData) {
          existing.combinedLPData.token0Amount += token.pairInfo.token0.amount;
          existing.combinedLPData.token1Amount += token.pairInfo.token1.amount;
          existing.combinedLPData.token0Value += token.pairInfo.token0.value;
          existing.combinedLPData.token1Value += token.pairInfo.token1.value;
          existing.combinedLPData.totalSharePercent += token.pairInfo.userSharePercent;
        }
        
      } else {
        const newToken = {
          ...token,
          totalValue: token.value || 0,
          walletCount: 1,
          wallets: [{
            address: wallets[index].slice(0, 8) + '...',
            amount: token.amount,
            value: token.value || 0,
            walletIndex: index
          }]
        };
        
        // Set up combined LP data if it's an LP token
        if (token.isLiquidityPair && token.pairInfo) {
          newToken.combinedLPData = {
            token0Amount: token.pairInfo.token0.amount,
            token1Amount: token.pairInfo.token1.amount,
            token0Value: token.pairInfo.token0.value,
            token1Value: token.pairInfo.token1.value,
            totalSharePercent: token.pairInfo.userSharePercent,
            token0Symbol: token.pairInfo.token0.symbol,
            token1Symbol: token.pairInfo.token1.symbol
          };
        }
        
        combinedTokens.set(key, newToken);
      }
    });
  });
  
  // Convert to array and sort by total value
  const finalTokens = Array.from(combinedTokens.values())
    .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
  
  // Calculate LP summary
  const lpTokens = finalTokens.filter(t => t.isLiquidityPair);
  totalLPValue = lpTokens.reduce((sum, lp) => sum + lp.totalValue, 0);
  
  const combinedLPSummary = lpTokens.length > 0 ? {
    count: lpTokens.length,
    totalValue: totalLPValue,
    positions: lpTokens.map(lp => ({
      pair: lp.combinedLPData ? `${lp.combinedLPData.token0Symbol}/${lp.combinedLPData.token1Symbol}` : lp.symbol,
      totalValue: lp.totalValue,
      walletCount: lp.walletCount,
      combinedSharePercent: lp.combinedLPData ? lp.combinedLPData.totalSharePercent : 0,
      token0Value: lp.combinedLPData ? lp.combinedLPData.token0Value : 0,
      token1Value: lp.combinedLPData ? lp.combinedLPData.token1Value : 0
    }))
  } : null;
  
  // Create combined report data
  const combinedResult = {
    address: `Combined Portfolio (${wallets.length} wallets)`,
    tokens: finalTokens,
    totalValue: totalPortfolioValue,
    tokenCount: finalTokens.length,
    scanDuration: 'N/A',
    lpSummary: combinedLPSummary,
    
    // Additional data for combined report
    walletBreakdown,
    individualWalletCount: wallets.length,
    portfolioDistribution: walletBreakdown.map(wallet => ({
      address: wallet.address,
      value: wallet.totalValue,
      percentage: totalPortfolioValue > 0 ? (wallet.totalValue / totalPortfolioValue * 100).toFixed(2) : 0
    }))
  };
  
  // Generate timestamp for filename
  const timestamp = Date.now();
  const baseFilename = `combined_portfolio_${wallets.length}wallets_${timestamp}`;
  
  // Save the combined report using the existing report generator
  const files = ReportGenerator.saveReports(combinedResult, baseFilename);
  
  // Also save a detailed breakdown
  saveCombinedDetailedReport(combinedResult, baseFilename);
  
  console.log(`\n✅ Combined report generated!`);
  console.log(`📊 Portfolio Summary:`);
  console.log(`   Total Value: ${totalPortfolioValue.toFixed(2)}`);
  console.log(`   Unique Tokens: ${finalTokens.length}`);
  console.log(`   LP Positions: ${lpTokens.length} (${totalLPValue.toFixed(2)})`);
  console.log(`   Wallets: ${wallets.length}`);
  
  return files;
}

// Save additional detailed report for combined portfolio
function saveCombinedDetailedReport(combinedResult, baseFilename) {
  const fs = require('fs');
  
  const detailedReport = {
    reportType: 'Combined Multi-Wallet Portfolio',
    generatedAt: new Date().toISOString(),
    summary: {
      totalWallets: combinedResult.individualWalletCount,
      totalValue: combinedResult.totalValue,
      uniqueTokens: combinedResult.tokenCount,
      lpPositions: combinedResult.lpSummary ? combinedResult.lpSummary.count : 0,
      lpValue: combinedResult.lpSummary ? combinedResult.lpSummary.totalValue : 0
    },
    walletDistribution: combinedResult.portfolioDistribution,
    walletBreakdown: combinedResult.walletBreakdown,
    
    // Token analysis
    tokenAnalysis: {
      totalTokens: combinedResult.tokens.length,
      tokensInMultipleWallets: combinedResult.tokens.filter(t => t.walletCount > 1).length,
      averageValuePerToken: combinedResult.totalValue / combinedResult.tokens.length,
      top10Tokens: combinedResult.tokens.slice(0, 10).map(token => ({
        symbol: token.symbol,
        totalValue: token.totalValue,
        walletCount: token.walletCount,
        isLP: token.isLiquidityPair || false
      }))
    },
    
    // LP analysis
    lpAnalysis: combinedResult.lpSummary ? {
      totalLPPositions: combinedResult.lpSummary.count,
      totalLPValue: combinedResult.lpSummary.totalValue,
      lpPercentageOfPortfolio: (combinedResult.lpSummary.totalValue / combinedResult.totalValue * 100).toFixed(2),
      positions: combinedResult.lpSummary.positions
    } : null,
    
    // Detailed token breakdown
    allTokens: combinedResult.tokens.map(token => ({
      symbol: token.symbol,
      name: token.name,
      totalAmount: token.amount,
      totalValue: token.totalValue,
      walletCount: token.walletCount,
      isLP: token.isLiquidityPair || false,
      walletDistribution: token.wallets,
      lpDetails: token.combinedLPData || null
    }))
  };
  
  const detailedFilename = `${baseFilename}_detailed.json`;
  fs.writeFileSync(detailedFilename, JSON.stringify(detailedReport, null, 2));
  console.log(`📈 Detailed combined report: ${detailedFilename}`);
}