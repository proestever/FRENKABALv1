import { useEffect, useState } from 'react';
import customTokenLogo from '../assets/100xfrenlogo.png';

// Cache for both found and not-found logos to prevent repeated API calls
// String value for found logos, false for confirmed not-found
const logoCache: Record<string, string | false> = {};

// Set of pending requests to prevent duplicate fetches
const pendingRequests = new Set<string>();

// Cache timeout (24 hours) for not-found logos to retry occasionally
const CACHE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// Token addresses we've tried recently but got a 404
const notFoundTimestamps: Record<string, number> = {};

/**
 * Custom hook to fetch and cache token logos with optimized performance
 * @param tokenAddress The token contract address
 * @param fallbackLogo Optional fallback logo URL
 * @returns The token logo URL
 */
export function useTokenLogo(tokenAddress: string, fallbackLogo?: string): string {
  const defaultLogo = fallbackLogo || customTokenLogo;
  const [logoUrl, setLogoUrl] = useState<string>(defaultLogo);
  
  useEffect(() => {
    // Normalize address for consistent caching
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // If this token is already in our cache and found, use it
    if (logoCache[normalizedAddress] === false) {
      // This is a known not-found logo
      const timestamp = notFoundTimestamps[normalizedAddress] || 0;
      const now = Date.now();
      
      // Check if we should retry (cache expired)
      if (now - timestamp > CACHE_TIMEOUT_MS) {
        // Cache expired, remove from not-found cache to retry
        delete logoCache[normalizedAddress];
        delete notFoundTimestamps[normalizedAddress];
      } else {
        // Still in cache timeout, use default
        return;
      }
    } else if (typeof logoCache[normalizedAddress] === 'string') {
      // We have a cached logo, use it
      setLogoUrl(logoCache[normalizedAddress] as string);
      return;
    }
    
    // Don't fetch if already pending to avoid duplicate requests
    if (pendingRequests.has(normalizedAddress)) {
      return;
    }
    
    // Mark as pending
    pendingRequests.add(normalizedAddress);
    
    // Fetch from API
    const fetchLogo = async () => {
      try {
        const response = await fetch(`/api/token-logo/${normalizedAddress}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.logoUrl) {
            // Add successful result to cache
            logoCache[normalizedAddress] = data.logoUrl;
            setLogoUrl(data.logoUrl);
          } else {
            // API returned OK but no logo URL - mark as not found
            logoCache[normalizedAddress] = false;
            notFoundTimestamps[normalizedAddress] = Date.now();
          }
        } else if (response.status === 404) {
          // Explicitly mark as not found with timestamp for retry logic
          logoCache[normalizedAddress] = false;
          notFoundTimestamps[normalizedAddress] = Date.now();
        }
      } catch (error) {
        // Only log once per session to avoid console spam
        if (!logoCache[normalizedAddress]) {
          console.error(`Error fetching logo for ${normalizedAddress}:`, error);
          // Still mark as not found to prevent repeated failed requests
          logoCache[normalizedAddress] = false;
          notFoundTimestamps[normalizedAddress] = Date.now();
        }
      } finally {
        // Remove from pending regardless of outcome
        pendingRequests.delete(normalizedAddress);
      }
    };
    
    fetchLogo();
  }, [tokenAddress, fallbackLogo]);
  
  return logoUrl;
}