import { Token, Wallet, Bookmark, User } from '@shared/schema';

/**
 * Interface for extended token with additional properties
 */
export interface ProcessedToken extends Token {
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  verified?: boolean;
}

/**
 * Fetch wallet data from the server API with pagination support
 * @param address - Wallet address to fetch data for
 * @param page - Page number for pagination (default: 1)
 * @param limit - Number of tokens per page (default: 50)
 * @param captchaResponse - Optional CAPTCHA response token if required
 */
export function fetchWalletData(
  address: string, 
  page: number = 1, 
  limit: number = 50,
  captchaResponse?: string
): Promise<Wallet> {
  let url = `/api/wallet/${address}?page=${page}&limit=${limit}`;
  
  // Add captcha response if provided
  if (captchaResponse) {
    url += `&captchaResponse=${encodeURIComponent(captchaResponse)}`;
  }
  
  return fetch(url)
    .then(async response => {
      if (!response.ok) {
        const errorData = await response.json();
        
        // If CAPTCHA is required, throw special error
        if (response.status === 429 && errorData.captchaRequired) {
          const captchaError = new Error('CAPTCHA_REQUIRED');
          // @ts-ignore - Add custom property
          captchaError.captchaRequired = true;
          throw captchaError;
        }
        
        throw new Error(errorData.message || 'Failed to fetch wallet data');
      }
      return response.json();
    });
}

/**
 * Fetch ALL wallet tokens in a single request (will be loaded in batches on server)
 * @param address - Wallet address to fetch data for
 * @param captchaResponse - Optional CAPTCHA response token if required
 */
export function fetchAllWalletTokens(address: string, captchaResponse?: string): Promise<Wallet> {
  let url = `/api/wallet/${address}/all`;
  
  // Add captcha response if provided
  if (captchaResponse) {
    url += `?captchaResponse=${encodeURIComponent(captchaResponse)}`;
  }
  
  return fetch(url)
    .then(async response => {
      if (!response.ok) {
        const errorData = await response.json();
        
        // If CAPTCHA is required, throw special error
        if (response.status === 429 && errorData.captchaRequired) {
          const captchaError = new Error('CAPTCHA_REQUIRED');
          // @ts-ignore - Add custom property
          captchaError.captchaRequired = true;
          throw captchaError;
        }
        
        throw new Error(errorData.message || 'Failed to fetch all wallet tokens');
      }
      return response.json();
    });
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

/**
 * Interface for paginated transaction response from server
 */
export interface TransactionResponse {
  result: any[];
  cursor: string | null;
  page: number;
  page_size: number;
  error?: string; // Add error property for error handling
}

/**
 * Fetch transaction history for a wallet address with pagination support
 * @param address - Wallet address to fetch transactions for
 * @param limit - Number of transactions per page (default: 100, Moralis free plan limit)
 * @param cursor - Pagination cursor for fetching next page of results
 * @returns Paginated transaction response
 */
export async function fetchTransactionHistory(
  address: string,
  limit: number = 100,
  cursor: string | null = null
): Promise<TransactionResponse> {
  try {
    // Build URL with query parameters
    let url = `/api/wallet/${address}/transactions?limit=${limit}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }
    
    console.log(`Fetching transaction history: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to fetch transaction history:', errorData);
      throw new Error(errorData.message || 'Failed to fetch transaction history');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    throw error;
  }
}

/**
 * Get all bookmarks for a user
 */
export async function getBookmarks(userId: number): Promise<Bookmark[]> {
  try {
    const response = await fetch(`/api/bookmarks/${userId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch bookmarks');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return [];
  }
}

/**
 * Check if a wallet address is bookmarked by user
 */
export async function isAddressBookmarked(userId: number, walletAddress: string): Promise<Bookmark | null> {
  try {
    const response = await fetch(`/api/bookmarks/${userId}/address/${walletAddress}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to check bookmark status');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error checking bookmark status:', error);
    return null;
  }
}

/**
 * Add a bookmark
 */
export async function addBookmark(userId: number, walletAddress: string, label: string, notes: string = ''): Promise<Bookmark | null> {
  try {
    const response = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        walletAddress,
        label,
        notes
      }),
    });
    
    if (response.status === 409) {
      // Already bookmarked
      const data = await response.json();
      return data.bookmark;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to add bookmark');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error adding bookmark:', error);
    return null;
  }
}

/**
 * Update a bookmark
 */
export async function updateBookmark(id: number, label: string, notes: string = ''): Promise<Bookmark | null> {
  try {
    const response = await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label,
        notes
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update bookmark');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error updating bookmark:', error);
    return null;
  }
}

/**
 * Delete a bookmark
 */
export async function deleteBookmark(id: number): Promise<boolean> {
  try {
    const response = await fetch(`/api/bookmarks/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete bookmark');
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return false;
  }
}

/**
 * Create or get user ID from wallet address, with signature verification
 * @param walletAddress The wallet address
 * @param authData Optional authentication data with signature
 */
export async function getUserFromWallet(
  walletAddress: string, 
  authData?: { 
    signature: string;
    message: string;
    timestamp: number;
    walletAddress: string;
  }
): Promise<number | null> {
  try {
    // Check if the wallet address is provided
    if (!walletAddress) {
      console.warn('Wallet address is required');
      return null;
    }
    
    const requestBody: any = { walletAddress };
    
    // If authentication data is provided, include it in the request
    if (authData) {
      requestBody.signature = authData.signature;
      requestBody.message = authData.message;
      requestBody.timestamp = authData.timestamp;
    }
    
    const response = await fetch('/api/users/wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    // For 404 errors, the endpoint might not be implemented yet
    if (response.status === 404) {
      console.warn('User wallet endpoint not found. This feature may not be fully implemented yet.');
      return null;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText || 'Unknown error' };
      }
      throw new Error(errorData.message || `Failed to get user from wallet (Status: ${response.status})`);
    }
    
    const data = await response.json();
    return data.id || null;
  } catch (error) {
    console.error('Error getting user from wallet:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Get full user profile data with all fields
 */
export async function getUserProfile(userId: number): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get user profile');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get user profile by wallet address
 * This is a convenience function that gets the user ID from wallet address and then gets the user profile
 * @param walletAddress The wallet address
 * @param authData Optional authentication data with signature
 */
export async function getUserProfileByWallet(
  walletAddress: string,
  authData?: { 
    signature: string;
    message: string;
    timestamp: number;
    walletAddress: string;
  }
): Promise<User | null> {
  try {
    // First get the user ID from wallet address
    const userId = await getUserFromWallet(walletAddress, authData);
    
    if (!userId) {
      return null;
    }
    
    // Then get the full user profile using the ID
    return await getUserProfile(userId);
  } catch (error) {
    console.error('Error getting user profile by wallet:', error);
    return null;
  }
}

/**
 * Update user profile information
 */
export async function updateUserProfile(userId: number, profileData: Partial<{
  displayName: string | null;
  website: string | null;
  twitterHandle: string | null;
  bio: string | null;
}>): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${userId}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update user profile');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error updating user profile:', error);
    return null;
  }
}

/**
 * Fetch specific token data for a wallet
 * This API is used to get tokens that might not be detected by the standard wallet API
 * @param walletAddress Wallet address to check for the token
 * @param tokenAddress Token contract address to look up
 * @returns Token data including balance and price if available
 */
export async function fetchSpecificToken(
  walletAddress: string,
  tokenAddress: string
): Promise<ProcessedToken | null> {
  try {
    console.log(`Fetching specific token ${tokenAddress} for wallet ${walletAddress}`);
    
    // Validate addresses
    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/) || !tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid wallet or token address format');
    }
    
    const response = await fetch(`/api/wallet/${walletAddress}/token/${tokenAddress}`);
    
    if (response.status === 404) {
      console.log(`No balance found for token ${tokenAddress} in wallet ${walletAddress}`);
      return null;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch token data');
    }
    
    const tokenData = await response.json();
    console.log(`Successfully fetched token data:`, tokenData);
    return tokenData;
  } catch (error) {
    console.error('Error fetching specific token:', error);
    return null;
  }
}
