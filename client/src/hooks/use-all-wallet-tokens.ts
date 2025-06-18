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
  
  // Set loading progress status with more controlled polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    // When fetching starts, update the progress status and start polling
    if (isFetching) {
      // Initialize progress when fetching starts
      setProgress({
        currentBatch: 1,
        totalBatches: 5, // Initial estimate
        status: 'loading',
        message: 'Fetching wallet data...',
        lastUpdated: Date.now()
      });
      
      const fetchProgress = () => {
        fetch('/api/loading-progress')
          .then(response => response.ok ? response.json() : null)
          .then(data => {
            if (data) {
              setProgress(prev => ({
                ...data,
                lastUpdated: Date.now()
              }));
            }
          })
          .catch(error => {
            console.error('Error fetching loading progress:', error);
          });
      };
      
      // Make an immediate request first
      fetchProgress();
      
      // Then poll every 3 seconds to reduce API load
      pollInterval = setInterval(fetchProgress, 3000);
    } else if (walletData || isError) {
      // When data is loaded or there's an error, update the progress
      const finalStatus = isError ? 'error' : 'complete';
      const finalMessage = isError 
        ? 'Error loading wallet data' 
        : `Successfully loaded ${walletData?.tokens?.length || 0} tokens`;
      
      // Update to final status
      setProgress(prev => ({
        ...prev,
        status: finalStatus,
        message: finalMessage,
        lastUpdated: Date.now()
      }));
      
      // Clear any existing polling interval first
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      
      // Check if background fetch was triggered
      if (walletData?.backgroundFetchTriggered && walletData?.missingPriceCount && walletAddress) {
        setProgress(prev => ({
          ...prev,
          status: 'loading',
          message: `Loading prices for ${walletData.missingPriceCount} additional tokens in background...`,
          lastUpdated: Date.now()
        }));
        
        // Start background batch service
        backgroundBatchService.startBackgroundBatch(
          walletAddress,
          walletData.missingPriceCount,
          (batchProgress: BackgroundBatchProgress) => {
            if (batchProgress.isActive) {
              setProgress(prev => ({
                ...prev,
                status: 'loading',
                message: `Background loading: ${batchProgress.completedTokens}/${batchProgress.totalTokens} token prices updated`,
                lastUpdated: Date.now()
              }));
            } else {
              // Background batch completed
              setProgress(prev => ({
                ...prev,
                status: 'complete',
                message: `Successfully loaded all ${walletData?.tokens?.length || 0} tokens with updated prices`,
                lastUpdated: Date.now()
              }));
              
              // Trigger a final refetch to get the updated data
              refetch();
            }
          }
        );
      } else {
        // One final update without additional API call to reduce load
        setProgress(prev => ({
          ...prev,
          status: finalStatus,
          message: finalMessage,
          lastUpdated: Date.now()
        }));
      }
    }
    
    // Clean up the interval when component unmounts or dependencies change
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      // Clean up background batch service
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