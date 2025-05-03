import { useCallback, useEffect, useState } from 'react';
import customTokenLogo from '../assets/100xfrenlogo.png';
import plsLogo from '../assets/pls-logo-optimized.png';

// Global cache shared across all instances of the hook
const logoCache: Record<string, string> = {
  // Preload common token logos
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': plsLogo,
  '0x5616458eb2bac88dd60a4b08f815f37335215f9b': plsLogo,
};

// Map for symbols of common tokens
const symbolToLogo: Record<string, string> = {
  'pls': plsLogo,
  'fren': customTokenLogo,
  'frens': customTokenLogo,
  'kabal': customTokenLogo,
  '100xfren': customTokenLogo,
};

// Set to keep track of batch requests in progress
const pendingBatchRequests = new Set<string>();

/**
 * Hook to fetch multiple token logos in a single batch request
 * This is much more efficient than making individual requests
 * 
 * @param tokenAddresses Array of token addresses to fetch logos for
 * @param tokenSymbols Corresponding array of token symbols (optional)
 * @returns Object mapping addresses to their logo URLs
 */
export function useBatchTokenLogos(
  tokenAddresses: string[], 
  tokenSymbols?: string[]
): Record<string, string> {
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  
  // Handle batch fetching of logos
  const fetchLogos = useCallback(async (addresses: string[]) => {
    // Skip if already pending
    const batchKey = addresses.sort().join(',');
    if (pendingBatchRequests.has(batchKey)) {
      return;
    }
    
    pendingBatchRequests.add(batchKey);
    
    try {
      // Filter out addresses we already have cached
      const uncachedAddresses = addresses.filter(addr => !logoCache[addr.toLowerCase()]);
      
      if (uncachedAddresses.length === 0) {
        // All logos are already cached, just return cached values
        const cachedLogos: Record<string, string> = {};
        addresses.forEach(addr => {
          const normalizedAddr = addr.toLowerCase();
          cachedLogos[normalizedAddr] = logoCache[normalizedAddr] || customTokenLogo;
        });
        setLogoUrls(cachedLogos);
        return;
      }
      
      // Fetch all missing logos in one batch request
      const response = await fetch('/api/token-logos/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addresses: uncachedAddresses }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update cache with new logos
        Object.entries(data).forEach(([addr, logoData]: [string, any]) => {
          if (logoData && logoData.logoUrl) {
            logoCache[addr.toLowerCase()] = logoData.logoUrl;
          }
        });
        
        // Update state with all logos (cached + newly fetched)
        const allLogos: Record<string, string> = {};
        addresses.forEach(addr => {
          const normalizedAddr = addr.toLowerCase();
          allLogos[normalizedAddr] = logoCache[normalizedAddr] || customTokenLogo;
        });
        
        setLogoUrls(allLogos);
      }
    } catch (error) {
      console.error('Error batch fetching token logos:', error);
    } finally {
      pendingBatchRequests.delete(batchKey);
    }
  }, []);
  
  useEffect(() => {
    // First check for any common token symbols we already know
    if (tokenSymbols) {
      tokenSymbols.forEach((symbol, index) => {
        if (!symbol) return;
        
        const normalizedSymbol = symbol.toLowerCase();
        if (symbolToLogo[normalizedSymbol]) {
          const addr = tokenAddresses[index].toLowerCase();
          logoCache[addr] = symbolToLogo[normalizedSymbol];
        }
      });
    }
    
    // Normalize all addresses for consistent caching
    const normalizedAddresses = tokenAddresses.map(addr => addr.toLowerCase());
    
    // Check if all logos are already cached
    const allCached = normalizedAddresses.every(addr => logoCache[addr]);
    
    if (allCached) {
      // If all are cached, just use cached values
      const cachedLogos: Record<string, string> = {};
      normalizedAddresses.forEach(addr => {
        cachedLogos[addr] = logoCache[addr] || customTokenLogo;
      });
      setLogoUrls(cachedLogos);
    } else {
      // Otherwise fetch the missing ones
      fetchLogos(normalizedAddresses);
    }
  }, [tokenAddresses, tokenSymbols, fetchLogos]);
  
  return logoUrls;
}