import { useState, useEffect, useRef } from 'react';

// Price cache with TTL (time-to-live) in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const priceCache: Record<string, { price: number, timestamp: number }> = {};

/**
 * Custom hook to fetch token prices in batch
 * @param tokenAddresses List of token addresses to fetch prices for
 * @returns Object containing token prices mapped by address
 */
export function useBatchTokenPrices(tokenAddresses: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  useEffect(() => {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return;
    }
    
    // Filter out duplicate addresses and normalize them
    const normalizedAddresses = tokenAddresses.map(addr => addr.toLowerCase());
    const uniqueAddresses = Array.from(new Set(normalizedAddresses));
    
    // Check cache first and use cached prices if available
    const now = Date.now();
    const cachedPrices: Record<string, number> = {};
    const addressesToFetch: string[] = [];
    
    uniqueAddresses.forEach(address => {
      if (priceCache[address] && now - priceCache[address].timestamp < CACHE_TTL) {
        // Use cached price
        cachedPrices[address] = priceCache[address].price;
      } else {
        // Need to fetch this price
        addressesToFetch.push(address);
      }
    });
    
    // If we have some cached prices, update state with those immediately
    if (Object.keys(cachedPrices).length > 0) {
      setPrices(prev => ({ ...prev, ...cachedPrices }));
    }
    
    // If we have addresses to fetch, make batch API call
    if (addressesToFetch.length > 0) {
      setIsLoading(true);
      setError(null);
      
      const fetchBatchPrices = async () => {
        try {
          const response = await fetch('/api/token-prices/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              addresses: addressesToFetch
            })
          });
          
          if (!response.ok) {
            throw new Error(`Error fetching token prices: ${response.status} ${response.statusText}`);
          }
          
          const newPrices = await response.json();
          
          if (!isMounted.current) return;
          
          // Update cache with new prices
          const timestamp = Date.now();
          Object.entries(newPrices).forEach(([address, price]) => {
            const normalizedAddress = address.toLowerCase();
            priceCache[normalizedAddress] = { price: price as number, timestamp };
          });
          
          // Update state with combined cached and new prices
          setPrices(prev => ({ ...prev, ...newPrices }));
        } catch (err) {
          console.error('Error fetching batch token prices:', err);
          if (isMounted.current) {
            setError(err as Error);
          }
        } finally {
          if (isMounted.current) {
            setIsLoading(false);
          }
        }
      };
      
      fetchBatchPrices();
    } else {
      // All prices were found in cache
      setIsLoading(false);
    }
  }, [tokenAddresses]);
  
  return { prices, isLoading, error };
}