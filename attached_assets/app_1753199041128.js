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

// Example 2: Scan multiple wallets
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

// Example 5: Quick portfolio check
async function quickCheck() {
  const scanner = new PulseChainScanner();
  
  // Get wallet from command line
  const wallet = process.argv[2];
  
  if (!wallet) {
    console.error("Usage: node app.js <wallet_address>");
    return;
  }
  
  try {
    const result = await scanner.scan(wallet);
    
    // Quick summary
    console.log("\n📊 Quick Summary:");
    console.log(`   Total Value: $${result.totalValue.toFixed(2)}`);
    console.log(`   Token Count: ${result.tokenCount}`);
    console.log(`   Biggest Holding: ${result.tokens[0]?.symbol || 'None'} ($${result.tokens[0]?.value.toFixed(2) || '0'})`);
    
    // Ask if user wants full report
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('\nGenerate full report? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        ReportGenerator.saveReports(result);
      }
      readline.close();
    });
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Main menu
async function main() {
  console.log(`
🚀 PulseChain Wallet Scanner
━━━━━━━━━━━━━━━━━━━━━━━━━━

Choose an option:
1. Basic scan (example wallet)
2. Scan multiple wallets
3. Watch wallet for changes
4. Scan with filters
5. Quick check (provide wallet)

Press Ctrl+C to exit
`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Enter option (1-5): ', async (answer) => {
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
      default:
        console.log("Invalid option");
    }
    readline.close();
  });
}

// Run if called directly
if (require.main === module) {
  // If wallet address provided, do quick check
  if (process.argv[2]) {
    quickCheck();
  } else {
    main();
  }
}

// Export functions for use in other scripts
module.exports = {
  basicScan,
  scanMultipleWallets,
  watchWallet,
  scanWithFilter,
  quickCheck
};