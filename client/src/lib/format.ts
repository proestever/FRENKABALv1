import { formatNumber, shortenAddress as utilsShortenAddress, formatCurrencyWithPrecision } from './utils';

/**
 * Re-export shortenAddress function from utils
 * This is for backward compatibility
 */
export const shortenAddress = utilsShortenAddress;

/**
 * Format a wallet address for display (shortening it)
 * Same as shortenAddress but with a different name for backward compatibility
 */
export function formatAccount(address: string): string {
  return shortenAddress(address);
}

/**
 * Format a number as currency
 * Re-exported from utils for backward compatibility
 */
export function formatCurrency(value: number): string {
  return formatCurrencyWithPrecision(value, 2, 2);
}

/**
 * Format a token value from raw blockchain representation to a human-readable format
 * 
 * @param value The raw token value (e.g. "1000000000000000000")
 * @param decimals The number of decimals the token uses (e.g. "18" for ETH)
 * @returns Formatted token value
 */
export function formatTokenValue(value: string | undefined, decimals: string | undefined): string {
  if (!value || !decimals) return '0';
  
  try {
    const dec = parseInt(decimals);
    if (isNaN(dec)) return '0';
    
    // Convert from big integer string to number with correct decimal places
    const amount = parseFloat(value) / Math.pow(10, dec);
    if (isNaN(amount)) return '0';
    
    // Format based on size
    if (amount > 1) {
      return formatNumber(amount, 4);
    } else if (amount > 0.0001) {
      return formatNumber(amount, 6);
    } else {
      return formatNumber(amount, 10);
    }
  } catch (error) {
    console.error('Error formatting token value:', error);
    return '0';
  }
}