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
 * Format a number as currency with standard 2 decimal places for USD values
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
 * Format a token price with special handling for very small values
 * Shows up to 5 decimals, and uses scientific notation for very small prices
 * @param value The price to format
 * @param currency The currency code (default: USD)
 * @returns Formatted price string
 */
export function formatTokenPrice(value: number, currency = 'USD'): string {
  if (value === 0) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  const absValue = Math.abs(value);
  
  // For very small values (< 0.00001), use scientific notation style
  if (absValue < 0.00001 && absValue > 0) {
    // Convert to string to count leading zeros after decimal
    const str = absValue.toFixed(20);
    const decimalIndex = str.indexOf('.');
    let leadingZeros = 0;
    
    // Count zeros after decimal point
    for (let i = decimalIndex + 1; i < str.length; i++) {
      if (str[i] === '0') {
        leadingZeros++;
      } else {
        break;
      }
    }
    
    // Get the significant digits (first 4 non-zero digits)
    const significantPart = str.slice(decimalIndex + 1 + leadingZeros, decimalIndex + 1 + leadingZeros + 4);
    
    // Format as $0.0₍ₙ₎digits where n is the number of zeros
    const sign = value < 0 ? '-' : '';
    return `${sign}$0.0₍${leadingZeros}₎${significantPart}`;
  }
  
  // For small values but not tiny (0.00001 to 0.01), show up to 5 decimals
  if (absValue < 0.01) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 5,
      maximumFractionDigits: 5
    }).format(value);
  }
  
  // For values >= 0.01, show up to 5 decimals but remove trailing zeros
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 5
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