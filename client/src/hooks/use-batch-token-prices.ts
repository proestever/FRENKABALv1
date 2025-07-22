import { useQuery } from '@tanstack/react-query';
// Removed DexScreener dependency - using smart contract prices instead

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
      
      // This hook is only used in transaction history for showing USD values
      // Since transaction history doesn't need real-time prices, return empty map
      console.log(`Price fetching disabled for transaction history - using smart contract prices in main views`);
      return {};
    },
    enabled: tokenAddresses.length > 0,
    staleTime: Infinity, // Never refetch
    refetchInterval: false, // No automatic refetching
  });
}