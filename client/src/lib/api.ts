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

/**
 * Get hidden tokens from local storage
 */
export function getHiddenTokens(): string[] {
  try {
    const hiddenTokens = localStorage.getItem('hiddenTokens');
    return hiddenTokens ? JSON.parse(hiddenTokens) : [];
  } catch (error) {
    console.error('Error getting hidden tokens from localStorage:', error);
    return [];
  }
}

/**
 * Toggle token visibility in local storage
 * @returns boolean - true if token is now hidden, false if visible
 */
export function toggleHiddenToken(tokenAddress: string): boolean {
  try {
    const hiddenTokens = getHiddenTokens();
    const isCurrentlyHidden = hiddenTokens.includes(tokenAddress);
    
    if (isCurrentlyHidden) {
      // Remove token from hidden list
      const updatedHiddenTokens = hiddenTokens.filter(address => address !== tokenAddress);
      localStorage.setItem('hiddenTokens', JSON.stringify(updatedHiddenTokens));
      
      // Dispatch a custom event to notify other components
      window.dispatchEvent(new CustomEvent('tokenVisibilityChanged'));
      
      return false; // Now visible
    } else {
      // Add token to hidden list
      hiddenTokens.push(tokenAddress);
      localStorage.setItem('hiddenTokens', JSON.stringify(hiddenTokens));
      
      // Dispatch a custom event to notify other components
      window.dispatchEvent(new CustomEvent('tokenVisibilityChanged'));
      
      return true; // Now hidden
    }
  } catch (error) {
    console.error('Error toggling hidden token in localStorage:', error);
    return false;
  }
}

/**
 * Check if token is hidden
 */
export function isTokenHidden(tokenAddress: string): boolean {
  try {
    const hiddenTokens = getHiddenTokens();
    return hiddenTokens.includes(tokenAddress);
  } catch (error) {
    console.error('Error checking if token is hidden:', error);
    return false;
  }
}

/**
 * Clear all hidden tokens from local storage
 */
export function clearHiddenTokens(): void {
  try {
    localStorage.removeItem('hiddenTokens');
  } catch (error) {
    console.error('Error clearing hidden tokens from localStorage:', error);
  }
}
