import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllWalletTokens } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';

/**
 * Hook for retrieving all wallet tokens at once (not paginated)
 * This loads all tokens in a single request, which might be batched on the server
 */
export function useAllWalletTokens(walletAddress: string | null) {
  const queryClient = useQueryClient();
  const prevWalletAddress = useRef<string | null>(null);
  
  const [progress, setProgress] = useState({
    currentBatch: 0,
    totalBatches: 1,
    status: 'idle' as 'idle' | 'loading' | 'complete' | 'error',
    message: ''
  });
  
  // Always invalidate the cache for the current wallet address on mount and when wallet changes
  useEffect(() => {
    // Always clear the cache for the current wallet address - even if it's the same as before
    if (walletAddress) {
      console.log('Invalidating cache for wallet:', walletAddress);
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${walletAddress}`] });
      
      // Clear any previous wallet address cache as well
      if (prevWalletAddress.current && prevWalletAddress.current !== walletAddress) {
        console.log('Clearing previous wallet cache:', prevWalletAddress.current);
        queryClient.invalidateQueries({ queryKey: [`wallet-all-${prevWalletAddress.current}`] });
      }
      
      prevWalletAddress.current = walletAddress;
    }
  }, [walletAddress, queryClient]);
  
  // Fetch wallet data with all tokens
  const { 
    data: walletData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: walletAddress ? [`wallet-all-${walletAddress}`] : ['wallet-all-empty'],
    enabled: !!walletAddress,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0, // Consider data always stale to force refetch
    gcTime: 0, // Don't cache between wallet loads (this is TanStack Query v5's replacement for cacheTime)
    queryFn: () => walletAddress ? fetchAllWalletTokens(walletAddress) : Promise.reject('No wallet address'),
  });
  
  // Set loading progress status without polling
  useEffect(() => {
    // When fetching starts, update the progress status
    if (isFetching) {
      setProgress({
        currentBatch: 1,
        totalBatches: 5, // Simplified estimate
        status: 'loading',
        message: 'Fetching wallet data...'
      });
      
      // Make a single request to get the current server-side progress
      // This will give us initial information, but we won't keep polling
      fetch('/api/loading-progress')
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) {
            setProgress(data);
          }
        })
        .catch(error => {
          console.error('Error fetching loading progress:', error);
        });
    } else {
      // When not fetching, set status to complete or error
      setProgress(prev => ({
        ...prev,
        status: isError ? 'error' : (walletData ? 'complete' : prev.status),
        message: isError ? 'Error loading wallet data' : (walletData ? 'Wallet data loaded successfully' : prev.message)
      }));
    }
  }, [isFetching, isError, walletData]);
  
  return {
    walletData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    progress
  };
}