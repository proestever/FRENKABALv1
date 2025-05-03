import { Token, Wallet } from '@shared/schema';

/**
 * Fetch wallet data from the server API
 */
export async function fetchWalletData(address: string): Promise<Wallet> {
  const response = await fetch(`/api/wallet/${address}`);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch wallet data');
  }
  
  return await response.json();
}

/**
 * Get recent addresses from local storage
 */
export function getRecentAddresses(): string[] {
  try {
    const recentAddresses = localStorage.getItem('recentAddresses');
    return recentAddresses ? JSON.parse(recentAddresses) : [];
  } catch (error) {
    console.error('Error getting recent addresses from localStorage:', error);
    return [];
  }
}

/**
 * Save recent address to local storage
 */
export function saveRecentAddress(address: string): void {
  try {
    const recentAddresses = getRecentAddresses();
    
    // Remove address if it exists already to avoid duplicates
    const filteredAddresses = recentAddresses.filter(addr => addr.toLowerCase() !== address.toLowerCase());
    
    // Add to beginning of array and limit to 5 addresses
    const updatedAddresses = [address, ...filteredAddresses].slice(0, 5);
    
    localStorage.setItem('recentAddresses', JSON.stringify(updatedAddresses));
  } catch (error) {
    console.error('Error saving recent address to localStorage:', error);
  }
}

/**
 * Clear recent addresses from local storage
 */
export function clearRecentAddresses(): void {
  try {
    localStorage.removeItem('recentAddresses');
  } catch (error) {
    console.error('Error clearing recent addresses from localStorage:', error);
  }
}
