import { useState, useEffect, useRef } from 'react';
import { fetchWalletData } from '@/lib/api';

// Define token interface here to avoid type conflicts
interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  exchange?: string;
  verified?: boolean;
  securityScore?: number;
  isNative?: boolean;
}

interface TokenDataCache {
  prices: Record<string, number>;
  logos: Record<string, string>;
  lastUpdated: number;
}

// Cache timeout: 30 minutes (matching server-side cache TTL)
const CACHE_TIMEOUT_MS = 30 * 60 * 1000;

// In-memory cache
const globalCache: Record<string, TokenDataCache> = {};

/**
 * Custom hook that prefetches and caches token data (prices and logos)
 * for a wallet address and a set of visible token addresses
 */
export function useTokenDataPrefetch(
  walletAddress: string,
  visibleTokenAddresses: string[]
): {
  prices: Record<string, number>;
  logos: Record<string, string>;
  isLoading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!walletAddress || visibleTokenAddresses.length === 0) {
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = walletAddress.toLowerCase();
    const cachedData = globalCache[cacheKey];
    const now = Date.now();

    if (cachedData && now - cachedData.lastUpdated < CACHE_TIMEOUT_MS) {
      // Cache is valid, use it
      setPrices(cachedData.prices);
      setLogos(cachedData.logos);
      setIsLoading(false);
      return;
    }

    // Fetch fresh data
    const fetchData = async () => {
      setIsLoading(true);
      
      try {
        // Fetch wallet data (which includes token prices)
        const data = await fetchWalletData(walletAddress);
        
        if (!isMounted.current) return;
        
        if (data && data.tokens) {
          // Extract prices and logos
          const tokenPrices: Record<string, number> = {};
          const tokenLogos: Record<string, string> = {};
          
          data.tokens.forEach((token: any) => {
            const address = token.address.toLowerCase();
            
            // Only include tokens with prices
            if (token.price) {
              tokenPrices[address] = token.price;
            }
            
            // Include logos for all tokens
            if (token.logo) {
              tokenLogos[address] = token.logo;
            }
          });
          
          // Always include native PLS token
          const plsToken = data.tokens.find(t => 
            t.isNative === true || t.symbol === 'PLS' || 
            t.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          );
          
          if (plsToken?.price) {
            tokenPrices['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsToken.price;
          }
          
          if (plsToken?.logo) {
            tokenLogos['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsToken.logo;
          } else {
            // Default PLS logo
            tokenLogos['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = '/assets/pls-logo-trimmed.png';
          }
          
          // Batch fetch visible token logos not already in the data
          const missingLogoAddresses = visibleTokenAddresses.filter(
            address => !tokenLogos[address.toLowerCase()]
          );
          
          if (missingLogoAddresses.length > 0) {
            try {
              const response = await fetch('/api/token-logos/batch', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  addresses: missingLogoAddresses,
                }),
              });
              
              if (response.ok) {
                const logoData = await response.json();
                
                // Add to logo cache
                Object.entries(logoData).forEach(([address, value]: [string, any]) => {
                  if (value && value.logoUrl) {
                    tokenLogos[address.toLowerCase()] = value.logoUrl;
                  }
                });
              }
            } catch (logoError) {
              console.error('Error fetching missing token logos:', logoError);
            }
          }
          
          // Update state and cache
          setPrices(tokenPrices);
          setLogos(tokenLogos);
          
          // Cache the results
          globalCache[cacheKey] = {
            prices: tokenPrices,
            logos: tokenLogos,
            lastUpdated: Date.now()
          };
        }
      } catch (error) {
        console.error('Error prefetching token data:', error);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    
    fetchData();
  }, [walletAddress, visibleTokenAddresses]);
  
  return { prices, logos, isLoading };
}