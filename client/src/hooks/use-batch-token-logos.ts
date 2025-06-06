import { useState, useEffect, useMemo } from 'react';

// Create a persistent token logo cache with a 24-hour lifetime
const TOKEN_LOGO_CACHE_KEY = 'frenkabal-token-logos-cache';
const TOKEN_LOGO_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface LogoCache {
  data: Record<string, string>;
  timestamp: number;
}

// Global cache for token logos
let globalLogoCache: Record<string, string> = {};

// Load cache from localStorage on initial import
try {
  const cachedData = localStorage.getItem(TOKEN_LOGO_CACHE_KEY);
  if (cachedData) {
    const parsed = JSON.parse(cachedData) as LogoCache;
    // Check if cache is still valid
    if (Date.now() - parsed.timestamp < TOKEN_LOGO_CACHE_EXPIRY) {
      globalLogoCache = parsed.data;
      console.log(`Loaded ${Object.keys(globalLogoCache).length} logo URLs from localStorage cache`);
    } else {
      console.log('Logo cache expired, will refresh');
      localStorage.removeItem(TOKEN_LOGO_CACHE_KEY);
    }
  }
} catch (error) {
  console.error('Error loading logo cache from localStorage:', error);
}

/**
 * Hook that fetches multiple token logos in a single batch request
 * This is much more efficient than individual requests for each token
 * Now with client-side caching to reduce API calls
 */
// Create a static function to access logos without using the hook directly
// This allows components to use this without hook order issues
export const getBatchTokenLogos = (addresses: string[]): Record<string, string> => {
  const normalizedAddresses = addresses
    .filter(Boolean)
    .map(addr => addr.toLowerCase());
    
  // Get cached logos for these addresses
  const results: Record<string, string> = {};
  
  normalizedAddresses.forEach(addr => {
    if (globalLogoCache[addr]) {
      results[addr] = globalLogoCache[addr];
    } else {
      // Default fallback if not in cache
      results[addr] = '/assets/100xfrenlogo.png';
    }
  });
  
  return results;
};

export function useBatchTokenLogos(addresses: string[]): Record<string, string> {
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [hasFetched, setHasFetched] = useState(false);
  
  // Create a normalized set of addresses for efficient cache checking
  const normalizedAddresses = useMemo(() => {
    return addresses
      .filter(Boolean)
      .map(addr => addr.toLowerCase());
  }, [addresses]);
  
  // Check which addresses we need to fetch (not in cache)
  const addressesToFetch = useMemo(() => {
    return normalizedAddresses.filter(addr => !globalLogoCache[addr]);
  }, [normalizedAddresses]);
  
  // Apply cached logos for addresses we already know
  useEffect(() => {
    // Start with the cached logos we already have
    const cachedResults: Record<string, string> = {};
    
    // First check if all addresses are in the cache
    let allCached = true;
    
    normalizedAddresses.forEach(addr => {
      if (globalLogoCache[addr]) {
        cachedResults[addr] = globalLogoCache[addr];
      } else {
        allCached = false;
      }
    });
    
    // Apply cached results immediately
    if (Object.keys(cachedResults).length > 0) {
      setLogoUrls(cachedResults);
    }
    
    // If everything is cached, we're done
    if (allCached) {
      setHasFetched(true);
      console.log('All logo URLs found in cache, no need to fetch');
    }
  }, [normalizedAddresses]);
  
  // Only fetch the addresses that weren't in the cache
  useEffect(() => {
    // If we've already fetched or there's nothing to fetch, return
    if (hasFetched || addressesToFetch.length === 0) {
      return;
    }
    
    console.log(`Fetching ${addressesToFetch.length} token logos not found in cache`);
    
    // Create a batch request to fetch all missing logos at once
    const fetchBatchLogos = async () => {
      try {
        const response = await fetch('/api/token-logos/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addresses: addressesToFetch,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch batch token logos');
        }
        
        const data = await response.json();
        
        // Extract logo URLs from the response
        const newLogos: Record<string, string> = {};
        
        // Process the response data
        Object.entries(data).forEach(([address, value]: [string, any]) => {
          const normalizedAddr = address.toLowerCase();
          if (value && value.logoUrl) {
            newLogos[normalizedAddr] = value.logoUrl;
            // Also update the global cache
            globalLogoCache[normalizedAddr] = value.logoUrl;
          } else {
            // Use fallback logo
            newLogos[normalizedAddr] = '/assets/100xfrenlogo.png';
            globalLogoCache[normalizedAddr] = '/assets/100xfrenlogo.png';
          }
        });
        
        // Merge with existing cached results
        setLogoUrls(prev => ({ ...prev, ...newLogos }));
        
        // Save the updated cache to localStorage
        try {
          localStorage.setItem(TOKEN_LOGO_CACHE_KEY, JSON.stringify({
            data: globalLogoCache,
            timestamp: Date.now()
          }));
        } catch (storageError) {
          console.error('Error saving logo cache to localStorage:', storageError);
        }
      } catch (error) {
        console.error('Error fetching batch token logos:', error);
        
        // Create fallback logos for the addresses that failed
        const fallbackUrls: Record<string, string> = {};
        addressesToFetch.forEach((address) => {
          // Default to Frenkabal logo
          const normalizedAddr = address.toLowerCase();
          fallbackUrls[normalizedAddr] = '/assets/100xfrenlogo.png';
          globalLogoCache[normalizedAddr] = '/assets/100xfrenlogo.png';
        });
        
        // Merge with existing results
        setLogoUrls(prev => ({ ...prev, ...fallbackUrls }));
      } finally {
        // Mark as fetched to prevent duplicate requests
        setHasFetched(true);
      }
    };
    
    fetchBatchLogos();
  }, [addressesToFetch, hasFetched]);

  return logoUrls;
}