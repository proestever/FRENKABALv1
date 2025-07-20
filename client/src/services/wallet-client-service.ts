/**
 * Client-side wallet service that fetches token balances from server
 * and prices/logos from DexScreener directly in the browser
 */

import { getTokenPriceFromDexScreener, TokenPriceData } from './dexscreener-client';
import { getTokenPriceFromContract, getMultipleTokenPricesFromContract } from './smart-contract-price-service';

// Import types directly from server since they're not in shared schema
interface ProcessedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  exchange?: string;
  verified?: boolean;
  securityScore?: number;
  isNative?: boolean;
  isLp?: boolean;
}

interface Wallet {
  address: string;
  tokens: ProcessedToken[];
  totalValue: number;
  tokenCount: number;
  plsBalance: number | undefined;
  plsPriceChange: number | undefined;
  networkCount: number;
  pricesNeeded?: boolean;
}

interface TokenWithPrice extends ProcessedToken {
  priceData?: TokenPriceData;
}

/**
 * Fetch wallet balances without prices from server
 */
async function fetchWalletBalancesNoPrices(address: string): Promise<Wallet> {
  const response = await fetch(`/api/wallet/${address}/balances-no-prices`);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch wallet balances');
  }
  
  return response.json();
}

/**
 * Save logo fetched from DexScreener to server
 */
async function saveLogoToServer(tokenAddress: string, logoUrl: string, symbol?: string, name?: string): Promise<void> {
  try {
    const response = await fetch('/api/token-logos/save-from-client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tokenAddress,
        logoUrl,
        symbol,
        name
      })
    });
    
    if (!response.ok) {
      console.error('Failed to save logo to server:', await response.text());
    }
  } catch (error) {
    console.error('Error saving logo to server:', error);
  }
}

/**
 * Fetch wallet data with client-side price fetching
 * This reduces server API calls and distributes load across users
 */
export async function fetchWalletDataClientSide(
  address: string, 
  onProgress?: (message: string, progress: number) => void
): Promise<Wallet> {
  try {
    // Step 1: Fetch balances without prices from server
    if (onProgress) onProgress('Fetching wallet balances...', 10);
    const walletDataRaw = await fetchWalletBalancesNoPrices(address);
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      return walletData;
    }
    
    // Step 2: Fetch prices from DexScreener client-side
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    let processedCount = 0;
    
    // Process in batches to avoid overwhelming DexScreener
    const BATCH_SIZE = 5;
    const batches: TokenWithPrice[][] = [];
    
    for (let i = 0; i < tokensWithPrices.length; i += BATCH_SIZE) {
      batches.push(tokensWithPrices.slice(i, i + BATCH_SIZE));
    }
    
    if (onProgress) onProgress('Fetching token prices from DexScreener...', 30);
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      await Promise.all(
        batch.map(async (token) => {
          try {
            // Skip if already has price (shouldn't happen with no-prices endpoint)
            if (token.price && token.price > 0) return;
            
            // For PLS native token, use WPLS price
            let tokenAddressForPrice = token.address;
            if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
              tokenAddressForPrice = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
            }
            
            // Fetch price from DexScreener
            const priceData = await getTokenPriceFromDexScreener(tokenAddressForPrice);
            
            if (priceData) {
              token.price = priceData.price;
              token.value = token.balanceFormatted * priceData.price;
              token.priceData = priceData;
              
              // If DexScreener provided a logo and we don't have one, save it
              if (priceData.logo && (!token.logo || token.logo.includes('100xfrenlogo'))) {
                token.logo = priceData.logo;
                
                // Save logo to server in background
                saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
              }
            }
          } catch (error) {
            console.error(`Failed to fetch price for ${token.symbol}:`, error);
          }
          
          processedCount++;
          const progress = Math.round(30 + (processedCount / totalTokens) * 60); // 30% to 90%
          if (onProgress) onProgress(`Fetching prices... (${processedCount}/${totalTokens})`, progress);
        })
      );
      
      // Small delay between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Step 3: Calculate total value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Step 4: Sort by value
    tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    if (onProgress) onProgress('Processing complete', 100);
    
    return {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue,
      plsBalance: walletData.plsBalance ?? undefined,
      plsPriceChange: walletData.plsPriceChange ?? undefined
    };
  } catch (error) {
    console.error('Error fetching wallet data client-side:', error);
    throw error;
  }
}

/**
 * Fetch wallet data using direct smart contract price reading for real-time prices
 * This provides faster updates (1-2 seconds) compared to DexScreener (30-60 seconds)
 */
export async function fetchWalletDataWithContractPrices(
  address: string, 
  onProgress?: (message: string, progress: number) => void
): Promise<Wallet> {
  try {
    // Step 1: Fetch balances without prices from server
    if (onProgress) onProgress('Fetching wallet balances...', 10);
    const walletDataRaw = await fetchWalletBalancesNoPrices(address);
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      return walletData;
    }
    
    // Step 2: Fetch prices from smart contracts directly
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    
    if (onProgress) onProgress('Reading prices from blockchain...', 30);
    
    // Prepare token addresses for batch price fetching
    const tokenAddresses = tokensWithPrices.map(token => {
      // For PLS native token, use WPLS price
      if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
      }
      return token.address;
    });
    
    // Fetch all prices in batches from smart contracts
    const priceMap = await getMultipleTokenPricesFromContract(tokenAddresses);
    
    // Apply prices to tokens
    let processedCount = 0;
    tokensWithPrices.forEach((token, index) => {
      const addressForPrice = tokenAddresses[index];
      const priceData = priceMap.get(addressForPrice.toLowerCase());
      
      if (priceData) {
        // Filter out dust tokens with less than $300 liquidity
        // Exception: Don't filter out native tokens or major tokens
        const isNativeToken = token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const isMajorToken = ['HEX', 'PLSX', 'INC', 'WPLS', 'PLS'].includes(token.symbol?.toUpperCase());
        
        if (priceData.liquidity < 300 && !isNativeToken && !isMajorToken) {
          token.price = 0; // Set price to 0 for dust tokens
          token.value = 0;
          token.priceData = undefined;
        } else {
          token.price = priceData.price;
          token.value = token.balanceFormatted * priceData.price;
          // Store minimal price data for UI (keep existing logo)
          token.priceData = {
            price: priceData.price,
            priceChange24h: 0, // Contract method doesn't provide 24h change
            liquidityUsd: priceData.liquidity,
            volumeUsd24h: 0, // Contract method doesn't provide volume
            dexId: 'pulsex',
            pairAddress: priceData.pairAddress,
            logo: token.logo // Preserve logo from server
          };
        }
      }
      
      processedCount++;
      const progress = Math.round(30 + (processedCount / totalTokens) * 60); // 30% to 90%
      if (onProgress) onProgress(`Processing prices... (${processedCount}/${totalTokens})`, progress);
    });
    
    // Step 3: Calculate total value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Step 4: Sort by value
    tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    if (onProgress) onProgress('Processing complete', 100);
    
    return {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue,
      plsBalance: walletData.plsBalance ?? undefined,
      plsPriceChange: walletData.plsPriceChange ?? undefined
    };
  } catch (error) {
    console.error('Error fetching wallet data with contract prices:', error);
    throw error;
  }
}

/**
 * Background batch logo fetcher for tokens without logos
 */
export async function fetchMissingLogosInBackground(tokens: ProcessedToken[]): Promise<void> {
  const tokensWithoutLogos = tokens.filter(t => 
    !t.logo || t.logo.includes('placeholder') || t.logo.includes('100xfrenlogo')
  );
  
  if (tokensWithoutLogos.length === 0) return;
  
  console.log(`Starting background logo fetch for ${tokensWithoutLogos.length} tokens`);
  
  // Process in larger batches since DexScreener can handle it
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < tokensWithoutLogos.length; i += BATCH_SIZE) {
    const batch = tokensWithoutLogos.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async (token) => {
        try {
          const priceData = await getTokenPriceFromDexScreener(token.address);
          
          if (priceData?.logo) {
            // Save logo to server
            await saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
            console.log(`Saved logo for ${token.symbol}`);
          }
        } catch (error) {
          console.error(`Failed to fetch logo for ${token.symbol}:`, error);
        }
      })
    );
    
    // Short delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('Background logo fetch completed');
}