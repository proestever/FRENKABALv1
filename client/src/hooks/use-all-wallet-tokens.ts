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
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes (reducing API calls)
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    queryFn: () => walletAddress ? fetchAllWalletTokens(walletAddress) : Promise.reject('No wallet address'),
  });
  
  // Set loading progress status with improved polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    // When fetching starts, update the progress status and start polling
    if (isFetching) {
      setProgress({
        currentBatch: 1,
        totalBatches: 5, // Initial estimate
        status: 'loading',
        message: 'Fetching wallet data...'
      });
      
      // Start polling for progress updates
      pollInterval = setInterval(() => {
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
      }, 700); // Poll every 700ms for progress updates
      
      // Make an immediate request as well
      fetch('/api/loading-progress')
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) {
            setProgress(data);
          }
        })
        .catch(error => {
          console.error('Error fetching initial loading progress:', error);
        });
    } else {
      // When data is loaded or there's an error, update the progress
      // but keep polling for a moment to ensure we get final status
      if (walletData || isError) {
        // When not fetching, set status to complete or error
        setProgress(prev => ({
          ...prev,
          status: isError ? 'error' : 'complete',
          message: isError ? 'Error loading wallet data' : 'Wallet data loaded successfully'
        }));
        
        // Make one final progress check
        fetch('/api/loading-progress')
          .then(response => response.ok ? response.json() : null)
          .then(data => {
            if (data && data.status === 'loading') {
              // If the server is still loading, update our progress but keep our complete status
              setProgress(prev => ({
                ...data,
                status: prev.status // Keep our complete/error status
              }));
            }
          })
          .catch(error => {
            console.error('Error fetching final loading progress:', error);
          });
      }
    }
    
    // Clean up the interval when component unmounts or dependencies change
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
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