/**
 * Client-side wallet service that fetches token balances from server
 * and prices/logos from DexScreener directly in the browser
 */

// Removed DexScreener dependency - using smart contract prices directly
import { getTokenPriceFromContract, getMultipleTokenPricesFromContract } from './smart-contract-price-service';
import { requestDeduplicator } from '@/lib/request-deduplicator';
import { PerformanceTimer } from '@/utils/performance-timer';

// Blacklist of known dust tokens to filter out
const DUST_TOKEN_BLACKLIST = new Set<string>([
  // Add dust token addresses here in lowercase
  // Example: '0x1234567890abcdef...',
]);

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
  error?: string;
}

interface TokenPriceData {
  price: number;
  priceChange24h: number;
  liquidityUsd: number;
  volumeUsd24h: number;
  dexId: string;
  pairAddress: string;
  logo?: string;
}

interface TokenWithPrice extends ProcessedToken {
  priceData?: TokenPriceData;
}

/**
 * Fetch wallet balances using scanner API (gets ALL tokens, not just recent)
 * Includes retry logic for better reliability
 */
async function fetchWalletBalancesFromScanner(address: string, retries = 3, useFastEndpoint = false): Promise<Wallet> {
  let lastError: Error | null = null;
  const endpoint = useFastEndpoint ? `/api/wallet/${address}/fast-balances` : `/api/wallet/${address}/scanner-balances`;
  const timeoutMs = useFastEndpoint ? 30000 : 600000; // 30 seconds for fast, 10 minutes for enhanced
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(endpoint, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Special handling for rate limit errors
        if (response.status === 429) {
          const waitTime = Math.min(2000 * attempt, 5000); // Exponential backoff, max 5 seconds
          console.log(`Rate limited on attempt ${attempt} for wallet ${address}, waiting ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to fetch wallet balances (status: ${response.status})`);
      }
      
      const data = await response.json();
      console.log(`Successfully fetched wallet ${address} on attempt ${attempt} using ${useFastEndpoint ? 'fast' : 'enhanced'} scanner`);
      return data;
      
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`Timeout on attempt ${attempt} for wallet ${address}`);
      } else {
        console.error(`Error on attempt ${attempt} for wallet ${address}:`, error);
      }
      
      // Wait before retrying (except on last attempt)
      if (attempt < retries) {
        const waitTime = Math.min(1000 * attempt, 3000); // Exponential backoff, max 3 seconds
        console.log(`Retrying wallet ${address} after ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed, return empty wallet data instead of throwing
  console.error(`Failed to fetch wallet ${address} after ${retries} attempts:`, lastError);
  return {
    address,
    tokens: [],
    totalValue: 0,
    tokenCount: 0,
    plsBalance: 0,
    plsPriceChange: 0,
    networkCount: 1,
    error: lastError?.message || 'Failed to fetch wallet data'
  };
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
    
    // Process in batches to avoid overwhelming DexScreener
    const BATCH_SIZE = 5;
    const batches: TokenWithPrice[][] = [];
    
    for (let i = 0; i < tokensWithPrices.length; i += BATCH_SIZE) {
      batches.push(tokensWithPrices.slice(i, i + BATCH_SIZE));
    }
    
    if (onProgress) onProgress('Fetching token logos...', 30);
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      await Promise.all(
        batch.map(async (token) => {
          try {
            // For PLS native token, use WPLS address
            let tokenAddressForDex = token.address;
            if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
              tokenAddressForDex = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
            }
            
            // Skip DexScreener entirely - logos come from server
            // Prices already come from smart contracts via the server
          } catch (error) {
            console.error(`Failed to fetch data for ${token.symbol}:`, error);
          }
          
          processedCount++;
          const progress = Math.round(30 + (processedCount / totalTokens) * 60); // 30% to 90%
          if (onProgress) onProgress(`Fetching logos... (${processedCount}/${totalTokens})`, progress);
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
 * Fetches wallet data using enhanced scanner (for portfolios)
 * Returns complete token data with LP token analysis
 */
export async function fetchWalletDataFast(address: string): Promise<Wallet> {
  const timer = new PerformanceTimer();
  timer.start(`wallet_service_${address.slice(0, 8)}`, { address });
  
  try {
    // Use enhanced scanner instead of fast endpoint to get LP token analysis
    const walletData = await timer.measure('scanner_balance_fetch', async () => {
      return await fetchWalletBalancesFromScanner(address, 3, false); // Use enhanced endpoint
    }, { address });
    
    if (walletData.error) {
      timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
      return walletData;
    }
    
    // Check if tokens array exists
    if (!walletData.tokens || !Array.isArray(walletData.tokens)) {
      timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
      return {
        ...walletData,
        tokens: [],
        totalValue: 0
      };
    }
    
    // Prepare token addresses for batch price fetching
    const tokenAddresses = walletData.tokens.map(token => {
      // For PLS native token, use WPLS price
      if (token.address.toLowerCase() === 'native' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
      }
      return token.address;
    });
    
    // Fetch all prices in batches from smart contracts
    const priceMap = await timer.measure('smart_contract_prices', async () => {
      return await getMultipleTokenPricesFromContract(tokenAddresses);
    }, { tokenCount: tokenAddresses.length });
    
    // Apply prices to tokens
    const tokensWithPrices = timer.measure('apply_prices', () => {
      return walletData.tokens.map((token, index) => {
        const addressForPrice = tokenAddresses[index];
        const priceData = priceMap.get(addressForPrice.toLowerCase());
        
        if (priceData) {
          // Calculate value without any cap
          const calculatedValue = token.balanceFormatted * priceData.price;
          
          return {
            ...token,
            price: priceData.price,
            value: calculatedValue,
            priceData
          };
        }
        
        return token;
      });
    }, { tokenCount: walletData.tokens.length });
    
    // Recalculate total value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    timer.end(`wallet_service_${address.slice(0, 8)}`, { 
      success: true,
      tokenCount: tokensWithPrices.length,
      totalValue
    });
    
    return {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue
    };
  } catch (error) {
    timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
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
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      return walletData;
    }
    
    // Step 2: Batch fetch ALL logos from server first (for immediate display)
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    
    if (onProgress) onProgress('Loading saved token logos...', 20);
    
    // Batch fetch logos for ALL tokens from server
    if (tokensWithPrices.length > 0) {
      try {
        console.log(`Batch loading logos for ${tokensWithPrices.length} tokens from server`);
        const BATCH_SIZE = 100;
        const addresses = tokensWithPrices.map(t => t.address);
        
        for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
          const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
          
          const response = await fetch('/api/token-logos/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: batchAddresses })
          });
          
          if (response.ok) {
            const logoMap = await response.json();
            
            // Apply logos to tokens immediately
            tokensWithPrices.forEach(token => {
              const logoData = logoMap[token.address.toLowerCase()];
              if (logoData?.logoUrl) {
                token.logo = logoData.logoUrl;
              }
            });
          }
        }
      } catch (error) {
        console.error('Failed to batch fetch logos from server:', error);
      }
    }
    
    // Step 3: Fetch prices from smart contracts
    if (onProgress) onProgress('Reading prices from blockchain...', 40);
    
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
        // Check if token is in blacklist
        const isBlacklisted = DUST_TOKEN_BLACKLIST.has(token.address.toLowerCase());
        
        if (isBlacklisted) {
          token.price = 0; // Set price to 0 for blacklisted dust tokens
          token.value = 0;
          token.priceData = undefined;
        } else {
          // Calculate value without any cap
          const calculatedValue = token.balanceFormatted * priceData.price;
          
          token.price = priceData.price;
          token.value = calculatedValue;
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
      const progress = Math.round(50 + (processedCount / totalTokens) * 40); // 50% to 90%
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
 * Limited to top 50 tokens by value for performance
 */
export async function fetchMissingLogosInBackground(tokens: ProcessedToken[]): Promise<void> {
  // Sort tokens by value and take only top 50
  const sortedTokens = [...tokens].sort((a, b) => (b.value || 0) - (a.value || 0));
  const top50Tokens = sortedTokens.slice(0, 50);
  
  const tokensWithoutLogos = top50Tokens.filter(t => 
    !t.logo || t.logo === '' || t.logo.includes('placeholder')
  );
  
  if (tokensWithoutLogos.length === 0) return;
  
  console.log(`Starting background logo fetch for ${tokensWithoutLogos.length} tokens (top 50 by value)`);
  
  try {
    // First, try to get logos from DexScreener for missing logos
    const tokenAddresses = tokensWithoutLogos.map(t => t.address);
    
    // Fetch from DexScreener API (they support batch requests)
    const BATCH_SIZE = 30; // DexScreener can handle larger batches
    
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      const batchAddresses = tokenAddresses.slice(i, i + BATCH_SIZE);
      
      try {
        const addressParam = batchAddresses.join(',');
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/pulsechain/${addressParam}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Update tokens with logos from DexScreener
          if (data.pairs && Array.isArray(data.pairs)) {
            for (const pair of data.pairs) {
              const token = tokensWithoutLogos.find(t => 
                t.address.toLowerCase() === pair.baseToken?.address?.toLowerCase()
              );
              
              if (token && pair.info?.imageUrl) {
                token.logo = pair.info.imageUrl;
                
                // Also save to server for future use
                fetch('/api/token-logos/batch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    addresses: [token.address],
                    logos: { [token.address.toLowerCase()]: pair.info.imageUrl }
                  })
                }).catch(err => console.error('Failed to save logo to server:', err));
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch logos from DexScreener:', error);
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('Error in background logo fetch:', error);
  }
  
  console.log('Background logo fetch completed');
}

/**
 * Optimized wallet data fetching for portfolios
 * Pre-fetches and caches prices for all unique tokens across multiple wallets
 */
export async function fetchPortfolioWalletsOptimized(
  addresses: string[],
  onProgress?: (message: string, progress: number) => void
): Promise<Record<string, Wallet>> {
  try {
    const results: Record<string, Wallet> = {};
    
    // Step 1: Fetch all wallet data in parallel (without prices)
    if (onProgress) onProgress(`Fetching data for ${addresses.length} wallets...`, 10);
    
    const walletDataPromises = addresses.map(async (address) => {
      try {
        const response = await fetch(`/api/wallet/${address}/scanner-balances`);
        if (!response.ok) {
          throw new Error(`Failed to fetch wallet ${address}`);
        }
        const data = await response.json();
        return { address, data };
      } catch (error) {
        console.error(`Error fetching wallet ${address}:`, error);
        return { address, data: null };
      }
    });
    
    const walletDataResults = await Promise.all(walletDataPromises);
    
    // Step 2: Collect all unique token addresses
    const uniqueTokenAddresses = new Set<string>();
    const validWallets: Array<{ address: string; data: Wallet }> = [];
    
    for (const { address, data } of walletDataResults) {
      if (data && data.tokens) {
        validWallets.push({ address, data });
        data.tokens.forEach((token: ProcessedToken) => {
          if (!token.isNative && !token.price && !token.isLp) {
            uniqueTokenAddresses.add(token.address.toLowerCase());
          }
        });
      } else {
        // Add error wallet to results
        results[address] = {
          address,
          tokens: [],
          totalValue: 0,
          tokenCount: 0,
          plsBalance: undefined,
          plsPriceChange: undefined,
          networkCount: 1,
          error: 'Failed to load wallet data'
        };
      }
    }
    
    if (onProgress) onProgress(`Fetching prices for ${uniqueTokenAddresses.size} unique tokens...`, 30);
    
    // Step 3: Fetch all prices at once
    const tokenAddressArray = Array.from(uniqueTokenAddresses);
    const priceMap = await getMultipleTokenPricesFromContract(tokenAddressArray);
    
    if (onProgress) onProgress(`Applying prices to ${validWallets.length} wallets...`, 70);
    
    // Step 4: Apply prices to all wallets
    for (const { address, data } of validWallets) {
      // Apply prices to tokens
      const tokensWithPrices = data.tokens.map((token: ProcessedToken) => {
        if (token.isNative || token.price || token.isLp) {
          return token;
        }
        
        const priceData = priceMap.get(token.address.toLowerCase());
        if (priceData) {
          const value = token.balanceFormatted * priceData.price;
          return {
            ...token,
            price: priceData.price,
            value,
            priceData: {
              price: priceData.price,
              priceChange24h: 0,
              liquidityUsd: priceData.liquidity,
              volumeUsd24h: 0,
              dexId: 'pulsex',
              pairAddress: priceData.pairAddress,
              logo: token.logo
            }
          };
        }
        return token;
      });
      
      // Calculate total value
      const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Sort by value
      tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
      
      results[address] = {
        ...data,
        tokens: tokensWithPrices,
        totalValue
      };
    }
    
    if (onProgress) onProgress('Portfolio loading complete', 100);
    
    return results;
  } catch (error) {
    console.error('Error in optimized portfolio fetch:', error);
    throw error;
  }
}