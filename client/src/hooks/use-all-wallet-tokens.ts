import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllWalletTokens } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';
import { backgroundBatchService, type BackgroundBatchProgress } from '@/services/background-batch';

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
    message: '',
    lastUpdated: Date.now() // Track when progress was last updated
  });
  
  // Track wallet address changes but don't automatically invalidate cache
  useEffect(() => {
    if (walletAddress && prevWalletAddress.current !== walletAddress) {
      console.log('Wallet address changed to:', walletAddress);
      prevWalletAddress.current = walletAddress;
    }
  }, [walletAddress]);
  
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
    refetchOnMount: false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: Infinity, // Data never becomes stale - remains static after initial load
    gcTime: Infinity, // Keep in cache indefinitely
    queryFn: () => walletAddress ? fetchAllWalletTokens(walletAddress) : Promise.reject('No wallet address'),
  });
  
  // Set loading progress status - only for initial loads, not background fetches
  useEffect(() => {
    // Only show loading progress for initial data fetch, not background operations
    if (isFetching && !walletData) {
      // Initialize progress for initial load only
      setProgress({
        currentBatch: 1,
        totalBatches: 1,
        status: 'loading',
        message: 'Loading wallet data...',
        lastUpdated: Date.now()
      });
    } else if (walletData || isError) {
      // When data is loaded or there's an error, update the progress
      const finalStatus = isError ? 'error' : 'complete';
      const finalMessage = isError 
        ? 'Error loading wallet data' 
        : `Successfully loaded ${walletData?.tokens?.length || 0} tokens`;
      
      // Update to final status
      setProgress({
        currentBatch: 1,
        totalBatches: 1,
        status: finalStatus,
        message: finalMessage,
        lastUpdated: Date.now()
      });
      
      // DISABLED: No automatic background fetching or refreshing
      // Data will remain static after initial load to prevent unwanted reloading
    }
    
    // Clean up background batch service when component unmounts
    return () => {
      if (walletAddress) {
        backgroundBatchService.stopBackgroundBatch(walletAddress);
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