import { useQuery } from '@tanstack/react-query';
import { getBatchTokenPrices } from '@/services/dexscreener-client';

/**
 * Custom hook to fetch token prices in batch directly from DexScreener
 * @param tokenAddresses List of token addresses to fetch prices for
 * @returns Query result with prices mapped by address
 */
export function useBatchTokenPrices(tokenAddresses: string[]) {
  return useQuery({
    queryKey: ['client-batch-prices', tokenAddresses.sort().join(',')],
    queryFn: async () => {
      if (tokenAddresses.length === 0) return {};
      
      console.log(`Fetching prices for ${tokenAddresses.length} tokens directly from DexScreener...`);
      const prices = await getBatchTokenPrices(tokenAddresses);
      
      // Convert to simple price mapping for compatibility
      const priceMap: Record<string, number> = {};
      Object.entries(prices).forEach(([address, priceData]) => {
        priceMap[address] = priceData.price;
      });
      
      console.log(`Client-side price fetch complete: ${Object.keys(priceMap).length} prices received`);
      return priceMap;
    },
    enabled: tokenAddresses.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}