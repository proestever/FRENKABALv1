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

// Cache timeout: 5 minutes
const CACHE_TIMEOUT_MS = 5 * 60 * 1000;

// In-memory cache
const globalCache: Record<string, TokenDataCache> = {};

/**
 * Custom hook that prefetches and caches token data (prices and logos)
 * for a wallet address and a set of visible token addresses
 * 
 * @param transactions Optional transactions array, used as a placeholder for compatibility
 * @param walletAddress The wallet address to fetch data for
 * @param visibleTokenAddresses Optional list of token addresses to prefetch
 */
export function useTokenDataPrefetch(
  transactionsOrWalletAddress: any[] | string,
  walletAddressOrTokenAddresses?: string | string[],
  optionalVisibleTokenAddresses?: string[]
): {
  prices: Record<string, number>;
  logos: Record<string, string>;
  isLoading: boolean;
} {
  // Handle different parameter combinations for backward compatibility
  let walletAddress: string;
  let visibleTokenAddresses: string[] = [];

  // Check if first param is wallet address (string) or transactions array
  if (typeof transactionsOrWalletAddress === 'string') {
    walletAddress = transactionsOrWalletAddress;
    
    // If second param is array, it's token addresses
    if (Array.isArray(walletAddressOrTokenAddresses)) {
      visibleTokenAddresses = walletAddressOrTokenAddresses;
    }
  } else {
    // First param is transactions array, second is wallet address
    if (typeof walletAddressOrTokenAddresses === 'string') {
      walletAddress = walletAddressOrTokenAddresses;
    } else {
      // If neither param is a valid wallet address, use a default empty string
      walletAddress = '';
    }
    
    // Third param is token addresses if provided
    if (Array.isArray(optionalVisibleTokenAddresses)) {
      visibleTokenAddresses = optionalVisibleTokenAddresses;
    }
  }
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
    // Add null/undefined check for visibleTokenAddresses
    if (!walletAddress || !visibleTokenAddresses || !Array.isArray(visibleTokenAddresses) || visibleTokenAddresses.length === 0) {
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