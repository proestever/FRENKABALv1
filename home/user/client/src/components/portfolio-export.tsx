import React from 'react';
import { Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ProcessedToken } from '@/types/token';
import { HexStakeSummary } from '@/types/hex';

interface PortfolioExportProps {
  portfolioName: string;
  walletData: {
    address: string;
    tokens: ProcessedToken[];
    totalValue: number;
    totalTokens: number;
    plsBalance?: number;
  };
  hexStakesData?: HexStakeSummary | null;
  walletBreakdown?: Array<{
    address: string;
    totalValue: number;
    tokenCount: number;
    error?: string;
  }>;
}

export function PortfolioExport({ 
  portfolioName, 
  walletData, 
  hexStakesData,
  walletBreakdown 
}: PortfolioExportProps) {
  
  // Generate HTML report
  const generateHTML = () => {
    const totalValueWithStakes = walletData.totalValue + (hexStakesData?.totalValue || 0);
    const lpTokens = walletData.tokens.filter(t => t.isLp);
    const regularTokens = walletData.tokens.filter(t => !t.isLp);
    
    let html = '<!DOCTYPE html>\n<html>\n<head>\n';
    html += '<title>' + portfolioName + ' Portfolio Report</title>\n';
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
    html += '.wallet-count { color: #888; font-size: 12px; }\n';
    html += '.lp-token { background: #2a2a4e; }\n';
    html += '.footer { text-align: center; margin-top: 30px; color: #888; }\n';
    html += '</style>\n</head>\n<body>\n';
    
    // Body content
    html += '<div class="container">\n';
    html += '<div class="header">\n';
    html += '<h1>' + portfolioName + ' Portfolio Report</h1>\n';
    html += '<p>Generated: ' + new Date().toLocaleString() + '</p>\n';
    html += '</div>\n';
    
    // Stats section
    html += '<div class="stats">\n';
    html += '<div class="stat-card"><div class="stat-label">Total Value</div><div class="stat-value">$' + totalValueWithStakes.toFixed(2) + '</div></div>\n';
    html += '<div class="stat-card"><div class="stat-label">Unique Tokens</div><div class="stat-value">' + walletData.tokens.length + '</div></div>\n';
    html += '<div class="stat-card"><div class="stat-label">LP Positions</div><div class="stat-value">' + lpTokens.length + '</div></div>\n';
    
    if (walletBreakdown) {
      html += '<div class="stat-card"><div class="stat-label">Wallets</div><div class="stat-value">' + walletBreakdown.length + '</div></div>\n';
    }
    
    if (hexStakesData && hexStakesData.totalStakes > 0) {
      html += '<div class="stat-card"><div class="stat-label">HEX Stakes</div><div class="stat-value">' + hexStakesData.totalStakes + '</div></div>\n';
      html += '<div class="stat-card"><div class="stat-label">Stakes Value</div><div class="stat-value">$' + hexStakesData.totalValue.toFixed(2) + '</div></div>\n';
    }
    
    html += '</div>\n';
    
    // Wallet breakdown if available
    if (walletBreakdown && walletBreakdown.length > 0) {
      html += '<h2>Wallet Breakdown</h2>\n';
      html += '<table>\n<thead>\n<tr>\n';
      html += '<th>Wallet Address</th><th>Value</th><th>Tokens</th><th>Status</th>\n';
      html += '</tr>\n</thead>\n<tbody>\n';
      
      for (const wallet of walletBreakdown) {
        html += '<tr>\n';
        html += '<td>' + wallet.address + '</td>\n';
        html += '<td>$' + wallet.totalValue.toFixed(2) + '</td>\n';
        html += '<td>' + wallet.tokenCount + '</td>\n';
        html += '<td>' + (wallet.error ? '❌ ' + wallet.error : '✅ Success') + '</td>\n';
        html += '</tr>\n';
      }
      
      html += '</tbody>\n</table>\n';
    }
    
    // Regular tokens table
    if (regularTokens.length > 0) {
      html += '<h2>Token Holdings</h2>\n';
      html += '<table>\n<thead>\n<tr>\n';
      html += '<th>Token</th><th>Amount</th><th>Price</th><th>Value</th><th>Wallets</th>\n';
      html += '</tr>\n</thead>\n<tbody>\n';
      
      for (const token of regularTokens) {
        html += '<tr>\n';
        html += '<td><div class="token-symbol">' + token.symbol + '</div><small>' + token.name + '</small></td>\n';
        html += '<td>' + (token.balanceFormatted || 0).toLocaleString() + '</td>\n';
        
        const priceStr = token.price && token.price < 0.01 ? token.price.toExponential(2) : (token.price || 0).toFixed(4);
        html += '<td>$' + priceStr + '</td>\n';
        html += '<td>$' + (token.value || 0).toFixed(2) + '</td>\n';
        html += '<td><span class="wallet-count">' + (token.walletCount || 1) + ' wallet(s)</span></td>\n';
        
        html += '</tr>\n';
      }
      
      html += '</tbody>\n</table>\n';
    }
    
    // LP tokens table
    if (lpTokens.length > 0) {
      html += '<h2>Liquidity Positions</h2>\n';
      html += '<table>\n<thead>\n<tr>\n';
      html += '<th>LP Token</th><th>Pool Composition</th><th>Total Value</th><th>Wallets</th>\n';
      html += '</tr>\n</thead>\n<tbody>\n';
      
      for (const lp of lpTokens) {
        html += '<tr class="lp-token">\n';
        html += '<td><div class="token-symbol">' + lp.symbol + '</div></td>\n';
        html += '<td>\n';
        
        if (lp.lpToken0Symbol && lp.lpToken1Symbol) {
          const token0Amount = lp.lpToken0BalanceFormatted || 0;
          const token1Amount = lp.lpToken1BalanceFormatted || 0;
          const token0Value = lp.lpToken0Value || 0;
          const token1Value = lp.lpToken1Value || 0;
          
          html += '<div>' + token0Amount.toFixed(4) + ' ' + lp.lpToken0Symbol + ' ($' + token0Value.toFixed(2) + ')</div>\n';
          html += '<div>' + token1Amount.toFixed(4) + ' ' + lp.lpToken1Symbol + ' ($' + token1Value.toFixed(2) + ')</div>\n';
        } else {
          html += '<div>LP Token</div>\n';
        }
        
        html += '</td>\n';
        html += '<td>$' + (lp.value || 0).toFixed(2) + '</td>\n';
        html += '<td><span class="wallet-count">' + (lp.walletCount || 1) + ' wallet(s)</span></td>\n';
        html += '</tr>\n';
      }
      
      html += '</tbody>\n</table>\n';
    }
    
    // Footer
    html += '<div class="footer">\n';
    html += '<p>Generated by FrenKabal Portfolio Tracker</p>\n';
    html += '<p>Data from PulseChain & PulseX liquidity pools</p>\n';
    html += '</div>\n';
    html += '</div>\n</body>\n</html>';
    
    return html;
  };

  // Generate JSON report
  const generateJSON = () => {
    const report = {
      portfolio: portfolioName,
      generatedAt: new Date().toISOString(),
      totalValue: walletData.totalValue,
      totalValueWithStakes: walletData.totalValue + (hexStakesData?.totalValue || 0),
      uniqueTokens: walletData.tokens.length,
      walletBreakdown: walletBreakdown || [],
      hexStakes: hexStakesData ? {
        totalStakes: hexStakesData.totalStakes,
        totalValue: hexStakesData.totalValue,
        stakes: hexStakesData.stakes
      } : null,
      tokens: walletData.tokens.map(token => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        amount: token.balanceFormatted || 0,
        price: token.price || 0,
        value: token.value || 0,
        walletCount: token.walletCount || 1,
        walletHoldings: token.walletHoldings || [],
        isLP: token.isLp || false,
        lpDetails: token.isLp ? {
          token0: {
            symbol: token.lpToken0Symbol,
            amount: token.lpToken0BalanceFormatted || 0,
            value: token.lpToken0Value || 0
          },
          token1: {
            symbol: token.lpToken1Symbol,
            amount: token.lpToken1BalanceFormatted || 0,
            value: token.lpToken1Value || 0
          }
        } : null
      }))
    };
    
    return JSON.stringify(report, null, 2);
  };

  // Generate CSV report
  const generateCSV = () => {
    let csv = 'Symbol,Name,Amount,Price,Value,Wallets,Type\n';
    
    for (const token of walletData.tokens) {
      const type = token.isLp ? 'LP' : 'Token';
      const price = token.price || 0;
      const value = token.value || 0;
      const amount = token.balanceFormatted || 0;
      const walletCount = token.walletCount || 1;
      
      // Escape quotes in names
      const name = token.name.replace(/"/g, '""');
      
      csv += '"' + token.symbol + '","' + name + '",' + amount + ',' + price + ',' + value + ',' + walletCount + ',' + type + '\n';
    }
    
    return csv;
  };

  // Download file helper
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export handlers
  const handleHTMLExport = () => {
    const html = generateHTML();
    const timestamp = new Date().getTime();
    downloadFile(html, `${portfolioName}_portfolio_${timestamp}.html`, 'text/html');
  };

  const handleJSONExport = () => {
    const json = generateJSON();
    const timestamp = new Date().getTime();
    downloadFile(json, `${portfolioName}_portfolio_${timestamp}.json`, 'application/json');
  };

  const handleCSVExport = () => {
    const csv = generateCSV();
    const timestamp = new Date().getTime();
    downloadFile(csv, `${portfolioName}_portfolio_${timestamp}.csv`, 'text/csv');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleHTMLExport} className="cursor-pointer">
          <span className="text-sm">HTML Report</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleJSONExport} className="cursor-pointer">
          <span className="text-sm">JSON Data</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCSVExport} className="cursor-pointer">
          <span className="text-sm">CSV Spreadsheet</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}