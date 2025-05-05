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
      
      // Define tokens with incorrect decimals that need fixing
      const tokensWithIncorrectDecimals: Record<string, number> = {
        "0xbd59a88754902B80922dFEBc15c7ea94a8C21ce2": 18 // PUPPERS token - Moralis reports 0 decimals but needs 18 adjustment
      };
      
      // Define tokens that might be missing from the API
      const missingTokenAddresses = [
        "0xec4252e62C6dE3D655cA9Ce3AfC12E553ebBA274" // PUMP.tires token
      ];
      
      // First get regular wallet data
      const data = await fetchAllWalletTokens(walletAddress);
      
      if (!data || !data.tokens) {
        return data;
      }
      
      // Fix any tokens with incorrect decimals
      for (let i = 0; i < data.tokens.length; i++) {
        const token = data.tokens[i];
        const normalizedAddress = token.address.toLowerCase();
        
        // Check if this token needs decimal correction
        Object.keys(tokensWithIncorrectDecimals).forEach(addressToFix => {
          if (normalizedAddress === addressToFix.toLowerCase()) {
            const decimalAdjustment = tokensWithIncorrectDecimals[addressToFix];
            
            console.log(`Fixing token ${token.symbol} (${token.address}) balance with ${decimalAdjustment} decimal adjustment`);
            
            if (token.balanceFormatted !== undefined) {
              console.log(`Original balance: ${token.balanceFormatted}`);
              
              // Apply the decimal adjustment (divide by 10^adjustment)
              const divisor = Math.pow(10, decimalAdjustment);
              const originalBalanceFormatted = token.balanceFormatted;
              token.balanceFormatted = token.balanceFormatted / divisor;
              
              // Recalculate the token's value based on the new balance
              if (token.price) {
                // Calculate old value to subtract from total
                const oldValue = originalBalanceFormatted * token.price;
                
                // Calculate new value
                token.value = token.balanceFormatted * token.price;
                
                // Update the wallet's total value if it exists
                if (data.totalValue !== undefined) {
                  // First subtract the old value
                  data.totalValue = data.totalValue - oldValue;
                  // Then add the corrected value
                  data.totalValue = data.totalValue + token.value;
                }
              }
              
              console.log(`Corrected balance: ${token.balanceFormatted}`);
              console.log(`Corrected value: ${token.value}`);
            }
          }
        });
      }
      
      // Then check for any missing tokens
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
            
            if (specificToken && specificToken.balanceFormatted && specificToken.balanceFormatted > 0) {
              console.log(`Found missing token ${specificToken.symbol} with balance ${specificToken.balanceFormatted}`);
              
              // Add the token to our wallet data
              data.tokens.push(specificToken);
              
              // Update total value and token count if they exist
              if (specificToken.value && data.totalValue !== undefined) {
                data.totalValue = data.totalValue + specificToken.value;
              }
              
              if (data.tokenCount !== undefined) {
                data.tokenCount = data.tokenCount + 1;
              }
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