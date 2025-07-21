/**
 * Client-side wallet service that fetches token balances from server
 * and prices/logos from DexScreener directly in the browser
 */

import { getTokenPriceFromDexScreener, TokenPriceData } from './dexscreener-client';
import { getTokenPriceFromContract, getMultipleTokenPricesFromContract } from './smart-contract-price-service';

// Blacklist of known dust tokens to filter out
const DUST_TOKEN_BLACKLIST = new Set<string>([
  // Add dust token addresses here in lowercase
  // Example: '0x1234567890abcdef...',
]);

// Optimized logo fetching for portfolio bundles with 400+ tokens
export async function fetchPortfolioLogos(
  walletData: Record<string, Wallet>, 
  onProgress?: (message: string, percentage: number) => void
): Promise<void> {
  // Step 1: Collect all unique tokens from all wallets
  const allTokens: Map<string, TokenWithPrice> = new Map();
  
  Object.values(walletData).forEach(wallet => {
    wallet.tokens?.forEach(token => {
      const key = token.address.toLowerCase();
      const existing = allTokens.get(key);
      
      if (existing) {
        // If token already exists, combine the values
        existing.value = (existing.value || 0) + (token.value || 0);
      } else {
        // Clone the token to avoid modifying original
        allTokens.set(key, { ...token });
      }
    });
  });
  
  // Step 2: Sort all tokens by combined value
  const sortedTokens = Array.from(allTokens.values())
    .filter(token => !token.hide) // Filter out hidden tokens
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  
  if (onProgress) {
    onProgress(`Preparing to fetch logos for top 50 tokens from ${sortedTokens.length} total tokens...`, 10);
  }
  
  // Step 3: Take top 50 tokens by value for logo fetching
  const tokensForLogos = sortedTokens.slice(0, 50);
  
  // Step 4: Fetch all logos in parallel
  const logoPromises = tokensForLogos.map(async (token, index) => {
    // Skip if already has a logo (and it's not the Frenkabal placeholder)
    if (token.logo && !token.logo.includes('100xfrenlogo')) {
      return;
    }
    
    try {
      const tokenAddressForDex = token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
        ? '0xa1077a294dde1b09bb078844df40758a5d0f9a27' 
        : token.address;
      
      const priceData = await getTokenPriceFromDexScreener(tokenAddressForDex);
      if (priceData?.logo) {
        // Update the logo in all wallet instances
        Object.values(walletData).forEach(wallet => {
          const walletToken = wallet.tokens?.find(t => 
            t.address.toLowerCase() === token.address.toLowerCase()
          );
          if (walletToken) {
            walletToken.logo = priceData.logo;
          }
        });
        
        // Save to server for future use
        saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
        
        if (onProgress) {
          const progress = Math.round(10 + ((index + 1) / tokensForLogos.length) * 80);
          onProgress(`Fetching logos... (${index + 1}/${tokensForLogos.length})`, progress);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch logo for ${token.symbol}:`, error);
    }
  });
  
  // Wait for all logos to complete
  await Promise.all(logoPromises);
  
  if (onProgress) {
    onProgress('Logo fetching complete', 100);
  }
}

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
  hide?: boolean;
}

/**
 * Fetch wallet balances using scanner API (gets ALL tokens, not just recent)
 */
async function fetchWalletBalancesFromScanner(address: string): Promise<Wallet> {
  const response = await fetch(`/api/wallet/${address}/scanner-balances`);
  
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
    // Step 1: Fetch ALL token balances using scanner API
    if (onProgress) onProgress('Fetching all wallet tokens...', 10);
    const walletDataRaw = await fetchWalletBalancesFromScanner(address);
    
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
    
    // Take top 50 tokens by value for logo fetching
    const tokensToProcess = tokensWithPrices.slice(0, 50);
    
    if (onProgress) onProgress('Fetching token logos from DexScreener...', 30);
    
    // Process all 50 tokens in parallel for maximum speed
    await Promise.all(
      tokensToProcess.map(async (token, index) => {
        try {
          // For PLS native token, use WPLS address
          let tokenAddressForDex = token.address;
          if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            tokenAddressForDex = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
          }
          
          // Always fetch from DexScreener to get logos, even if we have prices
          const priceData = await getTokenPriceFromDexScreener(tokenAddressForDex);
          
          if (priceData) {
            // Only update price if we don't have one from scanner
            if (!token.price || token.price === 0) {
              token.price = priceData.price;
              token.value = token.balanceFormatted * priceData.price;
            }
            token.priceData = priceData;
            
            // Always check for logo updates
            if (priceData.logo && (!token.logo || token.logo.includes('100xfrenlogo'))) {
              token.logo = priceData.logo;
              
              // Save logo to server in background
              saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch data for ${token.symbol}:`, error);
        }
        
        processedCount++;
        const progress = Math.round(30 + (processedCount / tokensToProcess.length) * 60); // 30% to 90%
        if (onProgress) onProgress(`Fetching logos... (${processedCount}/${tokensToProcess.length})`, progress);
      })
    );
    
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
    // Step 1: Fetch ALL token balances using scanner API
    if (onProgress) onProgress('Fetching all wallet tokens...', 10);
    const walletDataRaw = await fetchWalletBalancesFromScanner(address);
    
    console.log('Raw wallet data from scanner:', walletDataRaw);
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    console.log('Wallet data after conversion:', walletData);
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      console.log('No tokens found, returning early');
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
    
    // Fetch all prices in batches from smart contracts with better error handling
    let priceMap = new Map<string, any>();
    try {
      console.log('Fetching prices from smart contracts...');
      
      // Add a timeout wrapper to prevent hanging
      const pricePromise = getMultipleTokenPricesFromContract(tokenAddresses);
      const timeoutPromise = new Promise<Map<string, any>>((_, reject) => {
        setTimeout(() => reject(new Error('Price fetching timeout after 30 seconds')), 30000);
      });
      
      priceMap = await Promise.race([pricePromise, timeoutPromise]);
      console.log(`Successfully fetched prices for ${priceMap.size} tokens`);
    } catch (error) {
      console.error('Failed to fetch prices from smart contracts:', error);
      // Continue without prices rather than failing the entire query
      if (onProgress) onProgress('Using fallback pricing...', 40);
    }
    
    // Step 3: Fetch logos from DexScreener in parallel
    if (onProgress) onProgress('Fetching token logos...', 50);
    console.log('Starting logo fetching step...');
    
    // Limit logo fetching to top 50 tokens to avoid DexScreener rate limits
    const tokensForLogos = tokensWithPrices.slice(0, 50);
    
    // Fetch logos in parallel batches
    const logoPromises = tokensForLogos.map(async (token) => {
      if (!token.logo || token.logo.includes('100xfrenlogo')) {
        try {
          const tokenAddressForDex = token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
            ? '0xa1077a294dde1b09bb078844df40758a5d0f9a27' 
            : token.address;
          
          const priceData = await getTokenPriceFromDexScreener(tokenAddressForDex);
          if (priceData?.logo) {
            token.logo = priceData.logo;
            saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
          }
        } catch (error) {
          console.error(`Failed to fetch logo for ${token.symbol}:`, error);
        }
      }
    });
    
    // Wait for all logo fetches to complete
    await Promise.all(logoPromises);
    
    // Apply prices to tokens
    let processedCount = 0;
    tokensWithPrices.forEach((token, index) => {
      // First check if server already provided a price
      if (token.price && token.price > 0) {
        console.log(`Using server price for ${token.symbol}: $${token.price}`);
        token.value = token.balanceFormatted * token.price;
      } else {
        const addressForPrice = tokenAddresses[index];
        const priceData = priceMap.get(addressForPrice.toLowerCase());
        
        if (priceData) {
          // Check if token is in blacklist
          const isBlacklisted = DUST_TOKEN_BLACKLIST.has(token.address.toLowerCase());
          
          if (isBlacklisted) {
            token.price = 0; // Set price to 0 for blacklisted dust tokens
            token.value = 0;
            token.priceData = undefined;
          } else {
            console.log(`Using contract price for ${token.symbol}: $${priceData.price}`);
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
    
    const result = {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue,
      plsBalance: walletData.plsBalance ?? undefined,
      plsPriceChange: walletData.plsPriceChange ?? undefined
    };
    
    console.log('Returning wallet data with', result.tokens.length, 'tokens');
    return result;
  } catch (error) {
    console.error('Error fetching wallet data with contract prices:', error);
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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