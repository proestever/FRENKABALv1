/**
 * DexScreener API service for getting more accurate token prices
 */

import fetch from 'node-fetch';

const DEX_SCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';
const DEX_SCREENER_BATCH_API_BASE = 'https://api.dexscreener.com/tokens/v1';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[];
}

// Cache to avoid excessive API calls
const priceCache: Record<string, { price: number; priceChange24h: number; logo?: string; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Batch fetching queue
interface BatchQueueItem {
  tokenAddress: string;
  resolve: (value: TokenPriceData | null) => void;
  reject: (reason?: any) => void;
}

let batchQueue: BatchQueueItem[] = [];
let batchTimer: NodeJS.Timeout | null = null;
const BATCH_DELAY = 50; // 50ms delay to accumulate requests
const MAX_BATCH_SIZE = 30; // DexScreener limit

/**
 * Get token price in USD from DexScreener
 * @param tokenAddress The token contract address
 * @returns Price in USD or null if not found
 */
export interface TokenPriceData {
  price: number;
  priceChange24h: number;
  logo?: string;
}

/**
 * Process batch queue and fetch multiple tokens at once
 */
async function processBatchQueue() {
  if (batchQueue.length === 0) return;
  
  // Take items from queue (up to MAX_BATCH_SIZE)
  const itemsToProcess = batchQueue.splice(0, MAX_BATCH_SIZE);
  const tokenAddresses = itemsToProcess.map(item => item.tokenAddress);
  
  console.log(`Processing batch of ${tokenAddresses.length} tokens`);
  
  try {
    // Prepare addresses for batch API (handle special cases)
    const addressesToFetch = tokenAddresses.map(addr => {
      const normalizedAddress = addr.toLowerCase();
      // Special handling for native PLS token - use WPLS instead
      if (normalizedAddress === '0x0000000000000000000000000000000000000000' || 
          normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'; // WPLS address
      }
      return normalizedAddress;
    });
    
    // Join addresses for batch API
    const addressesParam = addressesToFetch.join(',');
    const url = `${DEX_SCREENER_BATCH_API_BASE}/pulsechain/${addressesParam}`;
    
    console.log(`Fetching batch from DexScreener: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn('DexScreener rate limit hit for batch request');
        // Retry with delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Put items back in queue for retry
        batchQueue.unshift(...itemsToProcess);
        return;
      }
      throw new Error(`Batch API error: ${response.status}`);
    }
    
    const data = await response.json() as DexScreenerResponse;
    const processedTokens = new Map<string, TokenPriceData>();
    
    // Process all pairs to find best price for each token
    if (data.pairs && data.pairs.length > 0) {
      for (const pair of data.pairs) {
        if (pair.chainId !== 'pulsechain') continue;
        
        const tokenAddress = pair.baseToken.address.toLowerCase();
        const existingData = processedTokens.get(tokenAddress);
        
        // Only process if we have better liquidity or no existing data
        if (!existingData || (pair.liquidity?.usd || 0) > (existingData.price ? pair.liquidity?.usd || 0 : 0)) {
          // Require minimum $5000 liquidity to prevent manipulation
          if (pair.priceUsd && pair.liquidity?.usd && pair.liquidity.usd >= 5000) {
            processedTokens.set(tokenAddress, {
              price: parseFloat(pair.priceUsd),
              priceChange24h: pair.priceChange?.h24 || 0,
              logo: pair.info?.imageUrl || undefined
            });
          }
        }
      }
    }
    
    // Resolve promises for each item
    itemsToProcess.forEach(item => {
      const normalizedAddress = item.tokenAddress.toLowerCase();
      let priceData = processedTokens.get(normalizedAddress);
      
      // Check if it was a PLS address that we converted to WPLS
      if (!priceData && (normalizedAddress === '0x0000000000000000000000000000000000000000' || 
                         normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')) {
        priceData = processedTokens.get('0xa1077a294dde1b09bb078844df40758a5d0f9a27');
      }
      
      if (priceData) {
        // Update cache
        priceCache[normalizedAddress] = {
          ...priceData,
          timestamp: Date.now()
        };
        console.log(`Batch: Got price for ${normalizedAddress}: $${priceData.price}`);
      }
      
      item.resolve(priceData || null);
    });
    
  } catch (error) {
    console.error('Batch processing error:', error);
    // Reject all promises in this batch
    itemsToProcess.forEach(item => item.reject(error));
  }
}

export async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<number | null> {
  const data = await getTokenPriceDataFromDexScreener(tokenAddress);
  return data ? data.price : null;
}

export async function getTokenPriceDataFromDexScreener(tokenAddress: string): Promise<TokenPriceData | null> {
  if (!tokenAddress) return null;
  
  // Normalize address
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Hardcode only DAI from Ethereum to $1 (the actual DAI stablecoin)
  const stablecoins: Record<string, number> = {
    '0xefd766ccb38eaf1dfd701853bfce31359239f305': 1.0 // DAI from Ethereum
  };
  
  if (stablecoins[normalizedAddress]) {
    return { price: stablecoins[normalizedAddress], priceChange24h: 0 };
  }
  
  // Check cache first
  const now = Date.now();
  if (priceCache[normalizedAddress] && now - priceCache[normalizedAddress].timestamp < CACHE_TTL) {
    console.log(`Using cached price data for ${normalizedAddress}: $${priceCache[normalizedAddress].price}, ${priceCache[normalizedAddress].priceChange24h}%`);
    return {
      price: priceCache[normalizedAddress].price,
      priceChange24h: priceCache[normalizedAddress].priceChange24h,
      logo: priceCache[normalizedAddress].logo
    };
  }
  
  // Use batch queue for fetching
  return new Promise((resolve, reject) => {
    // Add to batch queue
    batchQueue.push({
      tokenAddress: normalizedAddress,
      resolve,
      reject
    });
    
    // Schedule batch processing
    if (!batchTimer) {
      batchTimer = setTimeout(async () => {
        batchTimer = null;
        
        // Process current batch
        await processBatchQueue();
        
        // Check if there are more items to process
        if (batchQueue.length > 0) {
          // Process remaining items immediately
          while (batchQueue.length > 0) {
            await processBatchQueue();
          }
        }
      }, BATCH_DELAY);
    }
  });
}

/**
 * Get token prices for multiple tokens at once with rate limiting
 * @param tokenAddresses Array of token addresses
 * @returns Object mapping token addresses to prices
 */
export async function getTokenPricesFromDexScreener(tokenAddresses: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  // Check cache first for all addresses
  for (const address of tokenAddresses) {
    const normalizedAddress = address.toLowerCase();
    const now = Date.now();
    
    // If we have this price in the cache and it's not expired, use it
    if (priceCache[normalizedAddress] && now - priceCache[normalizedAddress].timestamp < CACHE_TTL) {
      console.log(`Using cached price for ${normalizedAddress}: $${priceCache[normalizedAddress].price}`);
      results[normalizedAddress] = priceCache[normalizedAddress].price;
    }
  }
  
  // Filter out addresses that we already have prices for from the cache
  const uncachedAddresses = tokenAddresses.filter(address => 
    !results[address.toLowerCase()]
  );
  
  if (uncachedAddresses.length === 0) {
    console.log('All token prices found in cache, no need to call API');
    return results;
  }
  
  console.log(`Fetching prices for ${uncachedAddresses.length} uncached tokens from DexScreener`);
  
  // Process in smaller batches to avoid overwhelming the API
  const BATCH_SIZE = 10; 
  const batches = [];
  
  for (let i = 0; i < uncachedAddresses.length; i += BATCH_SIZE) {
    batches.push(uncachedAddresses.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Split ${uncachedAddresses.length} tokens into ${batches.length} batches of max ${BATCH_SIZE}`);
  
  // Process each batch with a delay between batches
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    console.log(`Processing batch ${i+1}/${batches.length} with ${batch.length} tokens`);
    
    // Process this batch in parallel
    await Promise.all(batch.map(async (address) => {
      const normalizedAddress = address.toLowerCase();
      try {
        const priceData = await getTokenPriceDataFromDexScreener(normalizedAddress);
        if (priceData !== null) {
          results[normalizedAddress] = priceData.price;
        }
      } catch (error) {
        console.error(`Error fetching price for ${normalizedAddress}:`, error);
      }
    }));
    
    // Add a delay between batches to avoid rate limiting
    if (i < batches.length - 1) {  // No need to delay after the last batch
      console.log(`Waiting 500ms before processing next batch...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Get token balances for a wallet using PulseChain Scan API
 * @param walletAddress The wallet address
 * @returns Object with native balance and token balances
 */
export async function getWalletBalancesFromPulseChainScan(walletAddress: string): Promise<{
  nativeBalance: string;
  tokenBalances: Array<{
    address: string;
    name: string | null;
    symbol: string | null;
    decimals: string | null;
    balance: string;
  }>;
}> {
  try {
    console.log(`Fetching balances for ${walletAddress} from PulseChain Scan API`);
    
    // Get native PLS balance
    const addressResponse = await fetch(`https://api.scan.pulsechain.com/api/v2/addresses/${walletAddress}`);
    
    if (!addressResponse.ok) {
      throw new Error(`Error fetching address data: ${addressResponse.status} ${addressResponse.statusText}`);
    }
    
    const addressData = await addressResponse.json() as {
      coin_balance?: string;
      address?: string;
      is_contract?: boolean;
      tx_count?: number;
    };
    const nativeBalance = addressData.coin_balance || '0';
    
    // Get token balances
    const tokenBalancesResponse = await fetch(`https://api.scan.pulsechain.com/api/v2/addresses/${walletAddress}/token-balances`);
    
    if (!tokenBalancesResponse.ok) {
      throw new Error(`Error fetching token balances: ${tokenBalancesResponse.status} ${tokenBalancesResponse.statusText}`);
    }
    
    // Type for token balance items from PulseChain Scan API
    interface TokenBalanceItem {
      token: {
        address: string;
        name: string;
        symbol: string;
        decimals: string;
        type?: string;
        holders?: string;
        icon_url?: string | null;
      };
      value: string;
      token_id?: string | null;
    }
    
    const tokenBalancesData = await tokenBalancesResponse.json() as TokenBalanceItem[];
    
    const tokenBalances = tokenBalancesData.map((item: TokenBalanceItem) => ({
      address: item.token.address,
      name: item.token.name,
      symbol: item.token.symbol,
      decimals: item.token.decimals,
      balance: item.value
    }));
    
    return {
      nativeBalance,
      tokenBalances
    };
  } catch (error) {
    console.error(`Error fetching wallet balances from PulseChain Scan:`, error);
    throw error;
  }
}

/**
 * Get token logo from DexScreener even if no price data is available
 */
export async function getTokenLogoFromDexScreener(tokenAddress: string): Promise<string | null> {
  try {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache first for logo
    const cached = priceCache[normalizedAddress];
    if (cached && cached.logo) {
      return cached.logo;
    }
    
    console.log(`Fetching logo for ${tokenAddress} from DexScreener`);
    const response = await fetch(`${DEX_SCREENER_API_BASE}/tokens/${normalizedAddress}`);
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`DexScreener rate limit hit when fetching logo for ${tokenAddress}`);
      }
      return null;
    }
    
    const data = await response.json() as DexScreenerResponse;
    
    // Look for logo in any pair's info
    if (data.pairs && data.pairs.length > 0) {
      for (const pair of data.pairs) {
        if (pair.info?.imageUrl) {
          console.log(`Found logo for ${tokenAddress}: ${pair.info.imageUrl}`);
          return pair.info.imageUrl;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching logo from DexScreener for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get full token data from DexScreener including logos
 */
export async function getDexScreenerTokenData(tokenAddress: string): Promise<any> {
  if (!tokenAddress) return null;
  
  const normalizedAddress = tokenAddress.toLowerCase();
  
  try {
    const response = await fetch(`${DEX_SCREENER_API_BASE}/tokens/${normalizedAddress}`);
    
    if (!response.ok) {
      console.warn(`DexScreener API returned ${response.status} for ${normalizedAddress}`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching DexScreener data for ${normalizedAddress}:`, error);
    return null;
  }
}