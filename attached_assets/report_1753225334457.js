// report.js - Simple report generator for scan results
const fs = require("fs");

class ReportGenerator {
  // Generate HTML report
  static generateHTML(scanResult) {
    const { address, tokens, totalValue, tokenCount, scanDuration, lpSummary } = scanResult;
    
    // Separate LP tokens from regular tokens
    const lpTokens = tokens.filter(t => t.isLiquidityPair);
    const regularTokens = tokens.filter(t => !t.isLiquidityPair);
    
    // Build HTML string piece by piece to avoid syntax errors
    let html = '<!DOCTYPE html>\n<html>\n<head>\n';
    html += '<title>PulseChain Wallet Report</title>\n';
    html += '<style>\n';
    html += 'body { font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 20px; margin: 0; }\n';
    html += '.container { max-width: 1200px; margin: 0 auto; }\n';
    html += '.header { background: linear-gradient(135deg, #2a2a3e, #1a1a2e); padding: 30px; border-radius: 10px; margin-bottom: 30px; }\n';
    html += 'h1 { margin: 0 0 20px 0; color: #00ff88; }\n';
    html += 'h2 { color: #00ffff; margin-top: 30px; }\n';
    html += '.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }\n';
    html += '.stat-card { background: #2a2a3e; padding: 20px; border-radius: 8px; text-align: center; }\n';
    html += '.stat-label { color: #888; font-size: 14px; }\n';
    html += '.stat-value { font-size: 24px; font-weight: bold; color: #00ff88; margin-top: 5px; }\n';
    html += 'table { width: 100%; background: #2a2a3e; border-radius: 8px; overflow: hidden; border-collapse: collapse; margin-bottom: 20px; }\n';
    html += 'th { background: #1a1a2e; padding: 15px; text-align: left; color: #00ffff; }\n';
    html += 'td { padding: 15px; border-top: 1px solid #3a3a4e; }\n';
    html += 'tr:hover { background: #3a3a4e; }\n';
    html += '.token-symbol { font-weight: bold; color: #00ff88; }\n';
    html += '.no-price { color: #666; font-style: italic; }\n';
    html += '.lp-token { background: #2a2a4e; }\n';
    html += '.footer { text-align: center; margin-top: 30px; color: #888; }\n';
    html += '</style>\n</head>\n<body>\n';
    
    // Body content
    html += '<div class="container">\n';
    html += '<div class="header">\n';
    html += '<h1>PulseChain Wallet Report</h1>\n';
    html += '<p>Address: ' + address + '</p>\n';
    html += '<p>Generated: ' + new Date().toLocaleString() + '</p>\n';
    html += '</div>\n';
    
    // Stats section
    html += '<div class="stats">\n';
    html += '<div class="stat-card"><div class="stat-label">Total Value</div><div class="stat-value">$' + totalValue.toFixed(2) + '</div></div>\n';
    html += '<div class="stat-card"><div class="stat-label">Tokens Found</div><div class="stat-value">' + tokenCount + '</div></div>\n';
    
    if (lpSummary) {
      html += '<div class="stat-card"><div class="stat-label">LP Positions</div><div class="stat-value">' + lpSummary.count + '</div></div>\n';
      html += '<div class="stat-card"><div class="stat-label">LP Value</div><div class="stat-value">$' + lpSummary.totalValue.toFixed(2) + '</div></div>\n';
    }
    
    html += '<div class="stat-card"><div class="stat-label">Scan Time</div><div class="stat-value">' + scanDuration + 's</div></div>\n';
    html += '</div>\n';
    
    // Regular tokens table
    if (regularTokens.length > 0) {
      html += '<h2>Token Holdings</h2>\n';
      html += '<table>\n<thead>\n<tr>\n';
      html += '<th>Token</th><th>Amount</th><th>Price</th><th>Value</th>\n';
      html += '</tr>\n</thead>\n<tbody>\n';
      
      for (const token of regularTokens) {
        html += '<tr>\n';
        html += '<td><div class="token-symbol">' + token.symbol + '</div><small>' + token.name + '</small></td>\n';
        html += '<td>' + token.amount.toLocaleString() + '</td>\n';
        
        if (token.hasPrice) {
          const priceStr = token.price < 0.01 ? token.price.toExponential(2) : token.price.toFixed(4);
          html += '<td>$' + priceStr + '</td>\n';
          html += '<td>$' + token.value.toFixed(2) + '</td>\n';
        } else {
          html += '<td><span class="no-price">No price</span></td>\n';
          html += '<td>-</td>\n';
        }
        
        html += '</tr>\n';
      }
      
      html += '</tbody>\n</table>\n';
    }
    
    // LP tokens table
    if (lpTokens.length > 0) {
      html += '<h2>Liquidity Positions</h2>\n';
      html += '<table>\n<thead>\n<tr>\n';
      html += '<th>LP Token</th><th>Pool Composition</th><th>Your Share</th><th>Total Value</th>\n';
      html += '</tr>\n</thead>\n<tbody>\n';
      
      for (const lp of lpTokens) {
        html += '<tr class="lp-token">\n';
        html += '<td><div class="token-symbol">' + lp.symbol + '</div><small>' + lp.name + '</small></td>\n';
        html += '<td>\n';
        html += '<div>' + lp.pairInfo.token0.amount.toFixed(4) + ' ' + lp.pairInfo.token0.symbol + ' ($' + lp.pairInfo.token0.value.toFixed(2) + ')</div>\n';
        html += '<div>' + lp.pairInfo.token1.amount.toFixed(4) + ' ' + lp.pairInfo.token1.symbol + ' ($' + lp.pairInfo.token1.value.toFixed(2) + ')</div>\n';
        html += '</td>\n';
        html += '<td>' + lp.pairInfo.userSharePercent.toFixed(4) + '%</td>\n';
        html += '<td>$' + lp.value.toFixed(2) + '</td>\n';
        html += '</tr>\n';
      }
      
      html += '</tbody>\n</table>\n';
    }
    
    // Footer
    html += '<div class="footer">\n';
    html += '<p>Data from PulseChain API & PulseX liquidity pools</p>\n';
    html += '<p>WPLS price included • LP tokens analyzed</p>\n';
    html += '</div>\n';
    html += '</div>\n</body>\n</html>';
    
    return html;
  }

  // Generate JSON report
  static generateJSON(scanResult) {
    const report = {
      wallet: scanResult.address,
      scanTime: new Date().toISOString(),
      scanDuration: scanResult.scanDuration,
      totalValue: scanResult.totalValue,
      tokenCount: scanResult.tokenCount,
      lpSummary: scanResult.lpSummary || null,
      tokens: []
    };
    
    // Process tokens
    for (const token of scanResult.tokens) {
      const tokenData = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        amount: token.amount,
        price: token.price,
        value: token.value,
        hasPrice: token.hasPrice,
        isLiquidityPair: token.isLiquidityPair || false
      };
      
      // Add LP details if available
      if (token.isLiquidityPair && token.pairInfo) {
        tokenData.lpDetails = {
          token0: {
            symbol: token.pairInfo.token0.symbol,
            amount: token.pairInfo.token0.amount,
            value: token.pairInfo.token0.value
          },
          token1: {
            symbol: token.pairInfo.token1.symbol,
            amount: token.pairInfo.token1.amount,
            value: token.pairInfo.token1.value
          },
          sharePercent: token.pairInfo.userSharePercent
        };
      }
      
      report.tokens.push(tokenData);
    }
    
    return JSON.stringify(report, null, 2);
  }

  // Generate CSV report
  static generateCSV(scanResult) {
    let csv = 'Symbol,Name,Amount,Price,Value,Type\n';
    
    for (const token of scanResult.tokens) {
      const type = token.isLiquidityPair ? 'LP' : 'Token';
      const price = token.price !== undefined ? token.price : 'N/A';
      const value = token.value !== undefined ? token.value : 'N/A';
      
      // Escape quotes in names
      const name = token.name.replace(/"/g, '""');
      
      csv += '"' + token.symbol + '","' + name + '",' + token.amount + ',' + price + ',' + value + ',' + type + '\n';
    }
    
    return csv;
  }

  // Save reports to files
  static saveReports(scanResult, baseFilename) {
    if (!baseFilename) {
      const timestamp = Date.now();
      const addressShort = scanResult.address.slice(0, 6);
      baseFilename = 'pulsechain_' + addressShort + '_' + timestamp;
    }
    
    const files = {};
    
    try {
      // Save HTML
      const htmlContent = this.generateHTML(scanResult);
      const htmlFile = baseFilename + '.html';
      fs.writeFileSync(htmlFile, htmlContent);
      files.htmlFile = htmlFile;
      console.log('📄 HTML report saved to: ' + htmlFile);
    } catch (error) {
      console.error('Error saving HTML:', error.message);
    }
    
    try {
      // Save JSON
      const jsonContent = this.generateJSON(scanResult);
      const jsonFile = baseFilename + '.json';
      fs.writeFileSync(jsonFile, jsonContent);
      files.jsonFile = jsonFile;
      console.log('📊 JSON report saved to: ' + jsonFile);
    } catch (error) {
      console.error('Error saving JSON:', error.message);
    }
    
    try {
      // Save CSV
      const csvContent = this.generateCSV(scanResult);
      const csvFile = baseFilename + '.csv';
      fs.writeFileSync(csvFile, csvContent);
      files.csvFile = csvFile;
      console.log('📑 CSV report saved to: ' + csvFile);
    } catch (error) {
      console.error('Error saving CSV:', error.message);
    }
    
    return files;
  }
}

module.exports = ReportGenerator;