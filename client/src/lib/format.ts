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
 * Alias for formatAccount - shortens an address for display
 * @param address The full wallet address
 * @returns Shortened address format
 */
export function shortenAddress(address: string): string {
  return formatAccount(address);
}

/**
 * Format a number as currency with smart precision for very small values
 * @param value The number to format
 * @param currency The currency code (default: USD)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  if (value === 0) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  // For very small values, use more decimal places to show meaningful digits
  if (Math.abs(value) < 0.01) {
    // Find the first significant digit
    const absValue = Math.abs(value);
    let decimalPlaces = 2;
    
    // Calculate how many decimal places we need to show at least 4 significant digits
    if (absValue < 1) {
      const log = Math.floor(Math.log10(absValue));
      decimalPlaces = Math.max(2, Math.abs(log) + 3);
      // Cap at 10 decimal places for readability
      decimalPlaces = Math.min(decimalPlaces, 10);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    }).format(value);
  }

  // For normal values, use standard 2 decimal places
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