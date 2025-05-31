import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Implemented below

/**
 * Format a number as currency with standard 2 decimal places
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format a number as currency with variable precision
 */
export function formatCurrencyWithPrecision(value: number, minimumFractionDigits: number = 2, maximumFractionDigits: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

/**
 * Format a token amount based on its value
 */
export function formatTokenAmount(amount: number | undefined): string {
  if (amount === undefined) return '0';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount >= 1 ? 2 : 6
  }).format(amount);
}

/**
 * Format a USD value without the dollar sign
 */
export function formatUsd(amount: number | undefined): string {
  if (amount === undefined || isNaN(amount)) return '0.00';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format a percentage value
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero'
  }).format(value / 100);
}

/**
 * Truncate wallet address with optional parameters for start and end characters
 * @param address The address to truncate
 * @param startChars Number of characters to keep at the start (default: 6)
 * @param endChars Number of characters to keep at the end (default: 4)
 * @returns Truncated address with ellipsis
 */
export function truncateAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Get CSS class for positive/negative values
 */
export function getChangeColorClass(value: number | undefined): string {
  if (value === undefined || value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-green-400' : 'text-red-400';
}

/**
 * Get advanced CSS class with background for change values
 */
export function getAdvancedChangeClass(value: number | undefined): string {
  if (value === undefined || value === 0) return 'text-muted-foreground';
  return value > 0 
    ? 'text-green-400 font-medium' 
    : 'text-red-400 font-medium';
}

/**
 * Format a date to a human-readable string
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Shorten an Ethereum address for display
 */
export function shortenAddress(address: string): string {
  if (!address) return '';
  return address.slice(0, 6) + '...' + address.slice(-4);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy: ', err);
    return false;
  }
}

/**
 * Get external link for token on various platforms
 */
export function getTokenExternalLink(tokenAddress: string, platform: 'dexscreener' | 'pulsechain' | 'otterscan'): string {
  if (!tokenAddress) return '';
  
  switch (platform) {
    case 'dexscreener':
      return `https://dexscreener.com/pulsechain/${tokenAddress}`;
    case 'pulsechain':
      return `https://scan.pulsechain.com/address/${tokenAddress}`;
    case 'otterscan':
      return `https://otter.pulsechain.com/address/${tokenAddress}`;
    default:
      return '';
  }
}

/**
 * Combine multiple wallet data objects into a single consolidated wallet
 * This merges tokens, balances, and values to create a unified view
 */
export function combineWalletData(wallets: Record<string, any>): any {
  // Create a map to track combined tokens by address
  const tokenMap: Record<string, any> = {};
  let totalValue = 0;
  const walletAddresses = Object.keys(wallets);
  let totalLpTokens = 0;
  
  // Iterate through each wallet
  Object.values(wallets).forEach(wallet => {
    // Add to the total value
    totalValue += wallet.totalValue || 0;
    
    // Process each token
    wallet.tokens.forEach((token: any) => {
      const tokenAddress = token.address.toLowerCase();
      
      // Count LP tokens
      if (token.isLp) {
        totalLpTokens++;
      }
      
      if (tokenMap[tokenAddress]) {
        // If token already exists in our map, combine the values
        const existingToken = tokenMap[tokenAddress];
        
        // Add the balances (raw and formatted)
        const newBalance = BigInt(existingToken.balance || '0') + BigInt(token.balance || '0');
        const newBalanceFormatted = (existingToken.balanceFormatted || 0) + (token.balanceFormatted || 0);
        
        // Calculate combined value
        const newValue = (existingToken.value || 0) + (token.value || 0);
        
        // Update the token in our map
        tokenMap[tokenAddress] = {
          ...existingToken,
          balance: newBalance.toString(),
          balanceFormatted: newBalanceFormatted,
          value: newValue
        };
        
        // For LP tokens, also combine the underlying token values
        if (token.isLp) {
          // Combine LP token0 data
          if (token.lpToken0Balance && token.lpToken0BalanceFormatted) {
            const newToken0Balance = BigInt(existingToken.lpToken0Balance || '0') + BigInt(token.lpToken0Balance || '0');
            const newToken0BalanceFormatted = (existingToken.lpToken0BalanceFormatted || 0) + (token.lpToken0BalanceFormatted || 0);
            const newToken0Value = (existingToken.lpToken0Value || 0) + (token.lpToken0Value || 0);
            
            tokenMap[tokenAddress].lpToken0Balance = newToken0Balance.toString();
            tokenMap[tokenAddress].lpToken0BalanceFormatted = newToken0BalanceFormatted;
            tokenMap[tokenAddress].lpToken0Value = newToken0Value;
          }
          
          // Combine LP token1 data
          if (token.lpToken1Balance && token.lpToken1BalanceFormatted) {
            const newToken1Balance = BigInt(existingToken.lpToken1Balance || '0') + BigInt(token.lpToken1Balance || '0');
            const newToken1BalanceFormatted = (existingToken.lpToken1BalanceFormatted || 0) + (token.lpToken1BalanceFormatted || 0);
            const newToken1Value = (existingToken.lpToken1Value || 0) + (token.lpToken1Value || 0);
            
            tokenMap[tokenAddress].lpToken1Balance = newToken1Balance.toString();
            tokenMap[tokenAddress].lpToken1BalanceFormatted = newToken1BalanceFormatted;
            tokenMap[tokenAddress].lpToken1Value = newToken1Value;
          }
        }
      } else {
        // If token doesn't exist yet, add it to the map
        tokenMap[tokenAddress] = { ...token };
      }
    });
  });
  
  // Convert the token map back to an array
  const combinedTokens = Object.values(tokenMap);
  
  // Create the combined wallet object
  const combinedWallet = {
    address: `Combined (${walletAddresses.length} wallets)`,
    tokens: combinedTokens,
    totalValue: totalValue,
    tokenCount: combinedTokens.length,
    plsBalance: 0, // Will be calculated below
    plsPriceChange: 0, // Use the value from the first wallet that has it
    networkCount: 1, // Always 1 for PulseChain
    lpTokenCount: totalLpTokens // Add LP token count
  };
  
  // Find the PLS balance from all wallets
  const plsToken = combinedTokens.find((t: any) => t.isNative === true || t.symbol === 'PLS');
  if (plsToken) {
    combinedWallet.plsBalance = plsToken.balanceFormatted || 0;
    console.log('Combined PLS balance:', combinedWallet.plsBalance);
    
    // Get the price change from any PLS token (they should all have the same price change)
    const firstWalletWithPls = Object.values(wallets).find((wallet: any) => 
      wallet.tokens.some((t: any) => t.isNative === true || t.symbol === 'PLS')
    );
    
    if (firstWalletWithPls) {
      const firstPlsToken = firstWalletWithPls.tokens.find((t: any) => t.isNative === true || t.symbol === 'PLS');
      if (firstPlsToken) {
        combinedWallet.plsPriceChange = firstPlsToken.priceChange24h || 0;
      }
    }
  }
  
  console.log('Combined wallet total value:', totalValue);
  
  return combinedWallet;
}
