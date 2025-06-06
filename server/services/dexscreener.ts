/**
 * DexScreener API service for getting more accurate token prices
 */

import fetch from 'node-fetch';

const DEX_SCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';

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
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[];
}

// Cache to avoid excessive API calls
const priceCache: Record<string, { price: number; priceChange24h: number; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get token price in USD from DexScreener
 * @param tokenAddress The token contract address
 * @returns Price in USD or null if not found
 */
export interface TokenPriceData {
  price: number;
  priceChange24h: number;
}

export async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<number | null> {
  const data = await getTokenPriceDataFromDexScreener(tokenAddress);
  return data ? data.price : null;
}

export async function getTokenPriceDataFromDexScreener(tokenAddress: string): Promise<TokenPriceData | null> {
  if (!tokenAddress) return null;
  
  // Normalize address
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const now = Date.now();
  if (priceCache[normalizedAddress] && now - priceCache[normalizedAddress].timestamp < CACHE_TTL) {
    console.log(`Using cached price data for ${normalizedAddress}: $${priceCache[normalizedAddress].price}, ${priceCache[normalizedAddress].priceChange24h}%`);
    return {
      price: priceCache[normalizedAddress].price,
      priceChange24h: priceCache[normalizedAddress].priceChange24h
    };
  }
  
  try {
    // Special handling for native PLS token - use WPLS instead
    const addressToUse = normalizedAddress === '0x0000000000000000000000000000000000000000' || 
                        normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ? '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' // WPLS address
      : normalizedAddress;
    
    console.log(`Fetching price for ${addressToUse} from DexScreener`);
    
    const response = await fetch(`${DEX_SCREENER_API_BASE}/tokens/${addressToUse}`);
    
    if (!response.ok) {
      console.error(`Error fetching price from DexScreener: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json() as DexScreenerResponse;
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`No pairs found for token ${addressToUse}`);
      return null;
    }
    
    // Find the pair with highest liquidity
    let bestPair: DexScreenerPair | null = null;
    let highestLiquidity = 0;
    
    for (const pair of data.pairs) {
      // Only use pairs from pulsechain
      if (pair.chainId !== 'pulsechain') continue;
      
      // Ensure priceUsd is available
      if (!pair.priceUsd) continue;
      
      // Prefer pairs with higher liquidity
      if (pair.liquidity?.usd > highestLiquidity) {
        highestLiquidity = pair.liquidity.usd;
        bestPair = pair;
      }
    }
    
    if (!bestPair) {
      console.log(`No suitable pair found for token ${addressToUse}`);
      return null;
    }
    
    const price = parseFloat(bestPair.priceUsd);
    const priceChange24h = bestPair.priceChange?.h24 || 0;
    
    if (isNaN(price)) {
      console.log(`Invalid price for token ${addressToUse}`);
      return null;
    }
    
    // Cache the price and price change
    priceCache[normalizedAddress] = {
      price,
      priceChange24h,
      timestamp: now
    };
    
    console.log(`Got price data for ${normalizedAddress} from DexScreener: $${price}, 24h change: ${priceChange24h}%`);
    return { price, priceChange24h };
  } catch (error) {
    console.error(`Error fetching price from DexScreener:`, error);
    return null;
  }
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