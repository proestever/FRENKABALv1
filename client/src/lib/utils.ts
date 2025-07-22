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
  let totalPlsBalance = 0;
  
  // Iterate through each wallet to aggregate PLS balances
  Object.values(wallets).forEach(wallet => {
    // Add to the total value with sanity check
    const walletValue = wallet.totalValue || 0;
    // Cap individual wallet values at $10 million to prevent calculation errors
    const cappedValue = Math.min(walletValue, 10_000_000);
    if (walletValue > 10_000_000) {
      console.warn(`Wallet ${wallet.address} has suspicious totalValue of ${walletValue}, capping at $10M`);
    }
    totalValue += cappedValue;
    console.log('Processing wallet:', wallet.address, 'with totalValue:', cappedValue, 'tokenCount:', wallet.tokens?.length || 0);
    
    // Add up PLS balances
    if (wallet.plsBalance && wallet.plsBalance > 0) {
      totalPlsBalance += wallet.plsBalance;
    }
    
    // Process each token - check if tokens array exists
    if (!wallet.tokens || !Array.isArray(wallet.tokens)) {
      console.warn('Wallet has no tokens array:', wallet.address);
      return; // Skip this wallet if no tokens
    }
    
    wallet.tokens.forEach((token: any) => {
      try {
        const tokenAddress = token.address.toLowerCase();
        
        // Count LP tokens
        if (token.isLp) {
          totalLpTokens++;
          console.log('Found LP token:', token.symbol, 'value:', token.value);
        }
        
        if (tokenMap[tokenAddress]) {
          // If token already exists in our map, combine the values
          const existingToken = tokenMap[tokenAddress];
          
          // Add the balances (raw and formatted) with error handling for BigInt
          let newBalance = '0';
          try {
            newBalance = (BigInt(existingToken.balance || '0') + BigInt(token.balance || '0')).toString();
          } catch (bigIntError) {
            console.error('BigInt conversion error for token:', token.symbol, bigIntError);
            newBalance = existingToken.balance || token.balance || '0';
          }
          
          const newBalanceFormatted = (existingToken.balanceFormatted || 0) + (token.balanceFormatted || 0);
          
          // Calculate combined value with sanity check
          const newValue = Math.min((existingToken.value || 0) + (token.value || 0), 10_000_000);
          
          // Track which wallets hold this token
          if (!existingToken.walletHoldings) {
            existingToken.walletHoldings = [];
          }
          existingToken.walletHoldings.push({
            address: wallet.address,
            amount: token.balanceFormatted || 0,
            value: token.value || 0
          });
          
          // Update the token in our map
          tokenMap[tokenAddress] = {
            ...existingToken,
            balance: newBalance,
            balanceFormatted: newBalanceFormatted,
            value: newValue,
            walletCount: (existingToken.walletCount || 1) + 1
        };
        
        // For LP tokens, also combine the underlying token values
        if (token.isLp) {
          // Combine LP token0 data
          if (token.lpToken0Balance && token.lpToken0BalanceFormatted) {
            try {
              const newToken0Balance = BigInt(existingToken.lpToken0Balance || '0') + BigInt(token.lpToken0Balance || '0');
              const newToken0BalanceFormatted = (existingToken.lpToken0BalanceFormatted || 0) + (token.lpToken0BalanceFormatted || 0);
              const newToken0Value = (existingToken.lpToken0Value || 0) + (token.lpToken0Value || 0);
              
              tokenMap[tokenAddress].lpToken0Balance = newToken0Balance.toString();
              tokenMap[tokenAddress].lpToken0BalanceFormatted = newToken0BalanceFormatted;
              tokenMap[tokenAddress].lpToken0Value = newToken0Value;
            } catch (lpError) {
              console.error('Error combining LP token0 data:', lpError);
            }
          }
          
          // Combine LP token1 data
          if (token.lpToken1Balance && token.lpToken1BalanceFormatted) {
            try {
              const newToken1Balance = BigInt(existingToken.lpToken1Balance || '0') + BigInt(token.lpToken1Balance || '0');
              const newToken1BalanceFormatted = (existingToken.lpToken1BalanceFormatted || 0) + (token.lpToken1BalanceFormatted || 0);
              const newToken1Value = (existingToken.lpToken1Value || 0) + (token.lpToken1Value || 0);
              
              tokenMap[tokenAddress].lpToken1Balance = newToken1Balance.toString();
              tokenMap[tokenAddress].lpToken1BalanceFormatted = newToken1BalanceFormatted;
              tokenMap[tokenAddress].lpToken1Value = newToken1Value;
            } catch (lpError) {
              console.error('Error combining LP token1 data:', lpError);
            }
          }
        }
      } else {
        // If token doesn't exist yet, add it to the map
        tokenMap[tokenAddress] = { 
          ...token,
          walletCount: 1,
          walletHoldings: [{
            address: wallet.address,
            amount: token.balanceFormatted || 0,
            value: token.value || 0
          }]
        };
      }
      } catch (tokenError) {
        console.error(`Error processing token ${token?.symbol || 'unknown'} from wallet ${wallet.address}:`, tokenError);
        // Continue processing other tokens
      }
    });
  });
  
  // Convert the token map back to an array (no filtering)
  let combinedTokens = Object.values(tokenMap);
  
  // Check if PLS is already in the combined tokens (scanner includes it as native token)
  const plsAlreadyIncluded = combinedTokens.some((t: any) => 
    t.address === 'native' || t.address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
  
  // Only add PLS if it's not already included and there's a combined balance
  if (totalPlsBalance > 0 && !plsAlreadyIncluded) {
    // Find WPLS token to get PLS price
    const wplsToken = combinedTokens.find((t: any) => 
      t.address.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
    );
    const plsPrice = wplsToken?.price || 0;
    const plsPriceChange24h = wplsToken?.priceChange24h || 0;
    
    // Create PLS virtual token
    const plsToken = {
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Native PLS address convention
      symbol: 'PLS',
      name: 'PulseChain',
      balance: totalPlsBalance.toString(),
      value: totalPlsBalance * plsPrice,
      price: plsPrice,
      priceChange24h: plsPriceChange24h,
      balanceFormatted: totalPlsBalance,
      decimals: 18,
      logo: '', // Will be handled by TokenLogo component
      isLp: false,
      isNative: true
    };
    
    // Add PLS to the beginning of the token list
    combinedTokens.unshift(plsToken);
  }
  
  // Sort tokens by value
  combinedTokens = combinedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
  
  // Create the combined wallet object
  const combinedWallet = {
    address: `Combined (${walletAddresses.length} wallets)`,
    tokens: combinedTokens,
    totalValue: totalValue,
    tokenCount: combinedTokens.length,
    plsBalance: totalPlsBalance,
    plsPriceChange: 0, // Will be set below
    networkCount: 1, // Always 1 for PulseChain
    lpTokenCount: totalLpTokens // Add LP token count
  };
  
  // Get the PLS price change from the first wallet that has PLS
  const firstWalletWithPls = Object.values(wallets).find((wallet: any) => 
    wallet.plsBalance && wallet.plsBalance > 0
  );
  
  if (firstWalletWithPls) {
    // Try to get price change from WPLS token
    const wplsToken = firstWalletWithPls.tokens.find((t: any) => 
      t.address.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
    );
    if (wplsToken) {
      combinedWallet.plsPriceChange = wplsToken.priceChange24h || 0;
    }
  }
  
  console.log('Combined wallet summary:', {
    totalValue,
    totalTokens: combinedTokens.length,
    totalLpTokens,
    totalPlsBalance,
    walletsProcessed: walletAddresses.length
  });
  
  return combinedWallet;
}
