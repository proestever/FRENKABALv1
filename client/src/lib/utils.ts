import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Implemented below

/**
 * Format a number as currency
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
export function shortenAddress(address: string, chars: number = 10): string {
  if (!address) return '';
  if (chars <= 10) {
    return address.slice(0, 6) + '...' + address.slice(-4);
  }
  // For longer displays, show more characters
  const start = Math.floor(chars / 2);
  const end = Math.floor(chars / 2);
  return address.slice(0, start) + '...' + address.slice(-end);
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
