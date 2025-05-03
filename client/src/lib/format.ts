/**
 * Format a wallet address for display by showing only the first 6 and last 4 characters
 * @param address The full wallet address
 * @returns Shortened address format
 */
export function formatAccount(address: string): string {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Format a number as currency
 * @param value The number to format
 * @param currency The currency code (default: USD)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format a token amount with appropriate decimal places
 * @param amount The token amount
 * @param decimals Number of decimal places to show (default: 4)
 * @returns Formatted token amount
 */
export function formatTokenAmount(amount: number, decimals = 4): string {
  if (amount >= 1) {
    // For values >= 1, show up to 'decimals' decimal places, but trim trailing zeros
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  } else {
    // For small values, use fixed notation to ensure precision
    return amount.toFixed(decimals);
  }
}