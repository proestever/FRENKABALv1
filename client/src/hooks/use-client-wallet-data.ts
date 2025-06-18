import { useQuery } from '@tanstack/react-query';
import { getWalletTokenBalances } from '@/services/pulsechain-client';
import { getBatchTokenPrices } from '@/services/dexscreener-client';

/**
 * Hook that fetches wallet data directly from PulseChain and DexScreener APIs
 * This bypasses your server entirely to reduce API load and costs
 */
export function useClientWalletData(walletAddress: string) {
  return useQuery({
    queryKey: ['client-wallet-data', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      
      console.log('Fetching wallet data directly from PulseChain...');
      
      // Fetch wallet balances from PulseChain directly
      const walletData = await getWalletTokenBalances(walletAddress);
      if (!walletData) return null;
      
      console.log(`Found ${walletData.tokens.length} tokens, fetching prices from DexScreener...`);
      
      // Fetch prices for all tokens
      const tokenAddresses = walletData.tokens
        .filter(token => !token.isNative)
        .map(token => token.address);
      
      const prices = await getBatchTokenPrices(tokenAddresses);
      
      // Add PLS price
      const plsPriceData = await getBatchTokenPrices(['0xA1077a294dDE1B09bB078844df40758a5D0f9a27']);
      
      // Merge price data with wallet data
      let totalValue = 0;
      
      walletData.tokens = walletData.tokens.map(token => {
        let price = 0;
        let priceChange24h = 0;
        
        if (token.isNative) {
          // Use WPLS price for native PLS
          const plsPrice = plsPriceData['0xa1077a294dde1b09bb078844df40758a5d0f9a27'];
          if (plsPrice) {
            price = plsPrice.price;
            priceChange24h = plsPrice.priceChange24h;
          }
        } else {
          const tokenPrice = prices[token.address.toLowerCase()];
          if (tokenPrice) {
            price = tokenPrice.price;
            priceChange24h = tokenPrice.priceChange24h;
          }
        }
        
        const value = token.balanceFormatted * price;
        totalValue += value;
        
        return {
          ...token,
          price,
          priceChange24h,
          value
        };
      });
      
      walletData.totalValue = totalValue;
      
      console.log(`Wallet data fetch complete: ${walletData.tokens.length} tokens, $${totalValue.toFixed(2)} total value`);
      
      return walletData;
    },
    enabled: !!walletAddress,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}