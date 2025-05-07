import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { fetchDirectWalletBalances } from '@/lib/api';
import { Wallet } from '@shared/schema';

/**
 * Custom hook for fetching wallet balances directly from the blockchain
 * This hook bypasses API caches to get the most up-to-date balances immediately after swaps
 * It should be used sparingly, like right after user performs a swap transaction
 * @param walletAddress - The wallet address to fetch balances for
 * @param enabled - Whether to enable the query (default: true)
 */
export function useDirectWalletBalances(walletAddress: string | null, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Define a distinct query key for direct blockchain queries
  const directQueryKey = walletAddress ? `direct-blockchain-${walletAddress.toLowerCase()}` : null;
  
  // Main wallet data query that fetches directly from the blockchain
  const {
    data: walletData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Wallet, Error>({
    queryKey: directQueryKey ? [directQueryKey] : [],
    queryFn: () => {
      if (!walletAddress) throw new Error('No address provided');
      console.log('Fetching direct blockchain balances for:', walletAddress);
      return fetchDirectWalletBalances(walletAddress)
        .then(data => {
          console.log('Direct blockchain balances fetched successfully');
          return data;
        })
        .catch(error => {
          console.error('Error fetching direct blockchain balances:', error);
          throw error;
        });
    },
    enabled: !!walletAddress && enabled,
    staleTime: 5000, // Consider data fresh for just 5 seconds
    gcTime: 30000,   // Keep in cache for 30 seconds
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Function to manually refresh balances
  const refreshBalances = async () => {
    if (!walletAddress || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      console.log('Manually refreshing direct blockchain balances...');
      await refetch();
      
      // After a successful direct query, invalidate the regular wallet data cache
      // This ensures the main wallet view will refetch data on next view
      const regularQueryKey = `/api/wallet/${walletAddress}`;
      queryClient.invalidateQueries({ queryKey: [regularQueryKey] });
      
      console.log('Direct blockchain balance refresh complete');
    } catch (error) {
      console.error('Error refreshing direct blockchain balances:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Clear data when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      queryClient.invalidateQueries({ queryKey: [directQueryKey] });
    }
  }, [walletAddress, queryClient, directQueryKey]);

  return {
    walletData,
    isLoading,
    isError,
    error,
    isFetching,
    isRefreshing,
    refreshBalances,
  };
}