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
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes (reducing API calls)
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
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
      
      // Silent background fetch - don't show loading progress for background operations
      if ((walletData as any)?.backgroundFetchTriggered && (walletData as any)?.missingPriceCount && walletAddress) {
        // Start background batch service silently
        backgroundBatchService.startBackgroundBatch(
          walletAddress,
          (walletData as any).missingPriceCount,
          (batchProgress: BackgroundBatchProgress) => {
            // Silent background operation - only refetch when complete
            if (!batchProgress.isActive) {
              // Background batch completed - silently refetch
              refetch();
            }
          }
        );
      }
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