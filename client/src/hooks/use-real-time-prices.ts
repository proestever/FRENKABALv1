import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getMultipleTokenPricesFromContract } from '@/services/smart-contract-price-service';

interface TokenWithPrice {
  address: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceData?: any;
}

interface UseRealTimePricesOptions {
  walletAddress: string;
  tokens: TokenWithPrice[];
  enabled?: boolean;
  intervalMs?: number; // Default: 300000ms (5 minutes)
}

/**
 * Hook to fetch real-time prices from smart contracts at regular intervals
 * Updates the wallet query cache with fresh price data
 */
export function useRealTimePrices({
  walletAddress,
  tokens,
  enabled = true,
  intervalMs = 300000
}: UseRealTimePricesOptions) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);

  const updatePrices = useCallback(async () => {
    if (!enabled || tokens.length === 0 || isUpdatingRef.current) return;
    
    try {
      isUpdatingRef.current = true;
      
      // For very large wallets, only update top tokens by value to prevent performance issues
      const MAX_TOKENS_TO_UPDATE = 10;
      let tokensToUpdate = tokens;
      
      if (tokens.length > MAX_TOKENS_TO_UPDATE) {
        // Sort by value and take top 10
        tokensToUpdate = [...tokens]
          .sort((a, b) => (b.value || 0) - (a.value || 0))
          .slice(0, MAX_TOKENS_TO_UPDATE);
        console.log(`Limiting real-time updates to top ${MAX_TOKENS_TO_UPDATE} tokens by value`);
      }
      
      // Prepare token addresses
      const tokenAddresses = tokensToUpdate.map(token => {
        // For PLS native token, use WPLS price
        if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          return '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
        }
        return token.address;
      });
      
      // Fetch updated prices from smart contracts
      const priceMap = await getMultipleTokenPricesFromContract(tokenAddresses);
      
      // Update the query cache with new prices
      queryClient.setQueryData([`client-wallet-${walletAddress}`], (oldData: any) => {
        if (!oldData) return oldData;
        
        const updatedTokens = oldData.tokens.map((token: TokenWithPrice, index: number) => {
          const addressForPrice = tokenAddresses[index];
          const newPriceData = priceMap.get(addressForPrice.toLowerCase());
          
          if (newPriceData && newPriceData.price !== token.price) {
            // Price has changed, update it
            return {
              ...token,
              price: newPriceData.price,
              value: token.balanceFormatted * newPriceData.price,
              priceData: {
                ...token.priceData,
                price: newPriceData.price,
                liquidityUsd: newPriceData.liquidity,
                pairAddress: newPriceData.pairAddress,
                lastUpdate: newPriceData.lastUpdate
              }
            };
          }
          
          return token;
        });
        
        // Recalculate total value
        const totalValue = updatedTokens.reduce((sum: number, token: TokenWithPrice) => 
          sum + (token.value || 0), 0
        );
        
        return {
          ...oldData,
          tokens: updatedTokens,
          totalValue
        };
      });
      
      console.log('Real-time price update completed');
    } catch (error) {
      console.error('Error updating real-time prices:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [enabled, tokens, walletAddress, queryClient]);

  // Set up interval for price updates
  useEffect(() => {
    if (!enabled || tokens.length === 0) {
      return;
    }

    // Initial update after 2 seconds
    const initialTimeout = setTimeout(() => {
      updatePrices();
    }, 2000);

    // Then update at regular intervals
    intervalRef.current = setInterval(() => {
      updatePrices();
    }, intervalMs);

    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isUpdatingRef.current = false;
    };
  }, [enabled, tokens.length, intervalMs, updatePrices]);

  // Return a manual refresh function
  return {
    refreshPrices: updatePrices
  };
}