import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllWalletTokens, fetchSpecificToken } from '@/lib/api';
import { useEffect, useState, useRef } from 'react';
import { Wallet } from '@shared/schema';

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
    queryFn: async () => {
      if (!walletAddress) {
        return Promise.reject('No wallet address');
      }
      
      // First get regular wallet data
      const data = await fetchAllWalletTokens(walletAddress);
      
      // Then check for any missing tokens we know about
      // These tokens might not be included in the standard token balance APIs
      const missingTokenAddresses = [
        "0xec4252e62C6dE3D655cA9Ce3AfC12E553ebBA274" // PUMP.tires token
      ];
      
      for (const tokenAddress of missingTokenAddresses) {
        // Check if token is already in the wallet data
        const isTokenAlreadyIncluded = data.tokens.some(
          token => token.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        
        if (!isTokenAlreadyIncluded) {
          console.log(`Looking for missing token ${tokenAddress} in wallet ${walletAddress}`);
          
          try {
            // Try to fetch the specific token
            const specificToken = await fetchSpecificToken(walletAddress, tokenAddress);
            
            if (specificToken && specificToken.balanceFormatted > 0) {
              console.log(`Found missing token ${specificToken.symbol} with balance ${specificToken.balanceFormatted}`);
              
              // Add the token to our wallet data
              data.tokens.push(specificToken);
              
              // Update total value and token count
              if (specificToken.value) {
                data.totalValue += specificToken.value;
              }
              data.tokenCount += 1;
            }
          } catch (error) {
            console.error(`Error fetching missing token ${tokenAddress}:`, error);
          }
        }
      }
      
      return data;
    },
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