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
  
  // If wallet address changes, invalidate previous wallet address cache
  useEffect(() => {
    if (walletAddress && walletAddress !== prevWalletAddress.current) {
      // Clear the cache for this wallet to ensure fresh data
      if (walletAddress) {
        console.log('Invalidating cache for wallet:', walletAddress);
        queryClient.invalidateQueries({ queryKey: [`wallet-all-${walletAddress}`] });
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
  
  // Poll loading progress during fetching
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    // Only poll when we're actively fetching
    if (isFetching) {
      // Poll loading progress every 500ms
      intervalId = setInterval(async () => {
        try {
          const response = await fetch('/api/loading-progress');
          if (response.ok) {
            const progressData = await response.json();
            setProgress(progressData);
          }
        } catch (error) {
          console.error('Error fetching loading progress:', error);
        }
      }, 500);
    } else {
      // When not fetching, set status to complete or error
      setProgress(prev => ({
        ...prev,
        status: isError ? 'error' : (walletData ? 'complete' : prev.status)
      }));
    }
    
    // Clean up interval on unmount or when fetching status changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
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