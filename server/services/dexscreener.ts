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
const priceCache: Record<string, { price: number; priceChange24h?: number; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get token price in USD from DexScreener
 * @param tokenAddress The token contract address
 * @returns Price in USD or null if not found
 */
export async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<number | null> {
  if (!tokenAddress) return null;
  
  // Normalize address
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const now = Date.now();
  if (priceCache[normalizedAddress] && now - priceCache[normalizedAddress].timestamp < CACHE_TTL) {
    console.log(`Using cached price for ${normalizedAddress}: $${priceCache[normalizedAddress].price}`);
    return priceCache[normalizedAddress].price;
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
    
    if (isNaN(price)) {
      console.log(`Invalid price for token ${addressToUse}`);
      return null;
    }
    
    // Include price change in the cached data
    const priceChange24h = bestPair.priceChange?.h24 || 0;
    
    // Cache the price and price change
    priceCache[normalizedAddress] = {
      price,
      priceChange24h,
      timestamp: now
    };
    
    console.log(`Got price for ${normalizedAddress} from DexScreener: $${price} (24h change: ${priceChange24h}%)`);
    return price;
  } catch (error) {
    console.error(`Error fetching price from DexScreener:`, error);
    return null;
  }
}

/**
 * Get token 24h price change percentage from DexScreener
 * @param tokenAddress The token contract address
 * @returns 24h price change percentage or null if not found
 */
export async function getTokenPriceChange(tokenAddress: string): Promise<number | null> {
  if (!tokenAddress) return null;
  
  // Normalize address
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const now = Date.now();
  if (priceCache[normalizedAddress] && 
      now - priceCache[normalizedAddress].timestamp < CACHE_TTL &&
      priceCache[normalizedAddress].priceChange24h !== undefined) {
    console.log(`Using cached price change for ${normalizedAddress}: ${priceCache[normalizedAddress].priceChange24h}%`);
    return priceCache[normalizedAddress].priceChange24h;
  }
  
  // If we don't have price change data but need to get it, fetch price data which will also fetch price change
  await getTokenPriceFromDexScreener(tokenAddress);
  
  // Now check if we have the price change data in cache
  if (priceCache[normalizedAddress] && priceCache[normalizedAddress].priceChange24h !== undefined) {
    return priceCache[normalizedAddress].priceChange24h;
  }
  
  return null;
}

/**
 * Get token prices for multiple tokens at once
 * @param tokenAddresses Array of token addresses
 * @returns Object mapping token addresses to prices
 */
export async function getTokenPricesFromDexScreener(tokenAddresses: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  // Fetch prices in parallel
  await Promise.all(tokenAddresses.map(async (address) => {
    const price = await getTokenPriceFromDexScreener(address);
    if (price !== null) {
      results[address.toLowerCase()] = price;
    }
  }));
  
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
    
    const addressData = await addressResponse.json() as any;
    const nativeBalance = addressData.coin_balance || '0';
    
    // Get token balances
    const tokenBalancesResponse = await fetch(`https://api.scan.pulsechain.com/api/v2/addresses/${walletAddress}/token-balances`);
    
    if (!tokenBalancesResponse.ok) {
      throw new Error(`Error fetching token balances: ${tokenBalancesResponse.status} ${tokenBalancesResponse.statusText}`);
    }
    
    const tokenBalancesData = await tokenBalancesResponse.json() as any[];
    
    const tokenBalances = tokenBalancesData.map((item: any) => ({
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