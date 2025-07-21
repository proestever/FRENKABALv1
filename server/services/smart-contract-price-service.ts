/**
 * Server-side smart contract price service for fetching real-time token prices
 * directly from PulseChain liquidity pools - Optimized Version
 */

import { ethers } from 'ethers';
import { getProvider } from './rpc-provider';

interface PriceData {
  price: number;
  liquidity: number;
  pairAddress: string;
  token0: string;
  token1: string;
}

// ABIs
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)'
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)'
];

// Constants
const PULSEX_FACTORY = '0x1715a3E4A142d8b698131108995174F37aEBA10D';
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';

// Stablecoin addresses on PulseChain
const STABLECOINS = [
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', // USDC from Ethereum
  '0xefD766cCb38EaF1dfd701853BFCe31359239F305', // DAI from Ethereum  
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f', // USDT from Ethereum
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
];

// Cache for token prices (5 minute TTL)
const priceCache = new Map<string, { data: PriceData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Permanent cache for token decimals
const decimalsCache = new Map<string, number>();

// Special cache for WPLS price (1 minute TTL)
let wplsCache: { price: number; timestamp: number } | null = null;
const WPLS_CACHE_TTL = 60 * 1000; // 1 minute

// Price validation constants - REMOVED ALL FILTERING
// const MIN_PRICE = 0.000000001;
// const MAX_PRICE = 1000000;
// const MIN_LIQUIDITY = 100; // $100 minimum

// Custom error class for better debugging
class PriceServiceError extends Error {
  constructor(
    message: string,
    public tokenAddress: string,
    public context?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'PriceServiceError';
  }
}

// Retry logic with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>, 
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

// Optimized decimals fetching with permanent cache
async function getTokenDecimals(tokenAddress: string, provider: ethers.providers.Provider): Promise<number> {
  const normalized = tokenAddress.toLowerCase();
  
  if (decimalsCache.has(normalized)) {
    return decimalsCache.get(normalized)!;
  }
  
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    decimalsCache.set(normalized, decimals);
    return decimals;
  } catch (error) {
    console.error(`Error getting decimals for ${tokenAddress}:`, error);
    decimalsCache.set(normalized, 18); // Cache default too
    return 18;
  }
}

async function getPairReserves(pairAddress: string, provider: ethers.providers.Provider): Promise<{
  reserve0: ethers.BigNumber;
  reserve1: ethers.BigNumber;
  token0: string;
  token1: string;
} | null> {
  try {
    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    const [reserves, token0, token1] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
      pairContract.token1()
    ]);
    
    return {
      reserve0: reserves[0],
      reserve1: reserves[1],
      token0,
      token1
    };
  } catch (error) {
    console.error(`Error getting reserves for pair ${pairAddress}:`, error);
    return null;
  }
}

// Price validation - REMOVED ALL FILTERING
function validatePrice(priceData: PriceData, tokenAddress: string): boolean {
  // NO FILTERING - Accept all prices and liquidity levels
  return true;
}

// Optimized with parallel processing
async function getStablecoinPairPrice(tokenAddress: string, provider: ethers.providers.Provider): Promise<PriceData | null> {
  const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);
  
  // Get all pair addresses in parallel
  const pairPromises = STABLECOINS.map(stablecoin => 
    factory.getPair(tokenAddress, stablecoin)
      .then(pairAddress => ({ stablecoin, pairAddress }))
      .catch(() => ({ stablecoin, pairAddress: ethers.constants.AddressZero }))
  );
  
  const pairs = await Promise.all(pairPromises);
  const validPairs = pairs.filter(p => p.pairAddress !== ethers.constants.AddressZero);
  
  if (validPairs.length === 0) return null;
  
  // Process valid pairs in parallel
  const pricePromises = validPairs.map(async ({ stablecoin, pairAddress }) => {
    try {
      const pairData = await getPairReserves(pairAddress, provider);
      if (!pairData) return null;
      
      const [tokenDecimals, stableDecimals] = await Promise.all([
        getTokenDecimals(tokenAddress, provider),
        getTokenDecimals(stablecoin, provider)
      ]);
      
      // Determine which token is which
      const isToken0 = pairData.token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
      const stableReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;
      
      // Calculate price
      const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, tokenDecimals));
      const stableAmount = parseFloat(ethers.utils.formatUnits(stableReserve, stableDecimals));
      
      if (tokenAmount === 0) return null;
      
      const price = stableAmount / tokenAmount;
      const liquidity = stableAmount * 2; // Total liquidity in USD
      
      const priceData = { 
        price, 
        liquidity, 
        pairAddress, 
        token0: pairData.token0, 
        token1: pairData.token1 
      };
      
      // Validate price before returning
      return validatePrice(priceData, tokenAddress) ? priceData : null;
    } catch (error) {
      console.error(`Error processing pair ${pairAddress}:`, error);
      return null;
    }
  });
  
  const results = await Promise.all(pricePromises);
  const validResults = results.filter(Boolean) as PriceData[];
  
  // Return the pair with highest liquidity
  return validResults.length > 0
    ? validResults.sort((a, b) => b.liquidity - a.liquidity)[0]
    : null;
}

async function getWPLSPairPrice(tokenAddress: string, provider: ethers.providers.Provider): Promise<PriceData | null> {
  try {
    const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);
    const pairAddress = await factory.getPair(tokenAddress, WPLS_ADDRESS);
    
    if (pairAddress === ethers.constants.AddressZero) return null;
    
    const pairData = await getPairReserves(pairAddress, provider);
    if (!pairData) return null;
    
    const [tokenDecimals, wplsDecimals] = await Promise.all([
      getTokenDecimals(tokenAddress, provider),
      getTokenDecimals(WPLS_ADDRESS, provider)
    ]);
    
    // Determine which token is which
    const isToken0 = pairData.token0.toLowerCase() === tokenAddress.toLowerCase();
    const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
    const wplsReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;
    
    // Calculate price in WPLS
    const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, tokenDecimals));
    const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, wplsDecimals));
    
    if (tokenAmount === 0) return null;
    
    const priceInWPLS = wplsAmount / tokenAmount;
    
    // Get WPLS price in USD
    const wplsPrice = await getWPLSPrice(provider);
    const price = priceInWPLS * wplsPrice;
    const liquidity = wplsAmount * wplsPrice * 2; // Total liquidity in USD
    
    const priceData = { 
      price, 
      liquidity, 
      pairAddress, 
      token0: pairData.token0, 
      token1: pairData.token1 
    };
    
    // Validate price before returning
    return validatePrice(priceData, tokenAddress) ? priceData : null;
  } catch (error) {
    console.error(`Error getting WPLS pair price for ${tokenAddress}:`, error);
    return null;
  }
}

async function getWPLSPrice(provider: ethers.providers.Provider): Promise<number> {
  // Check cache first
  if (wplsCache && Date.now() - wplsCache.timestamp < WPLS_CACHE_TTL) {
    return wplsCache.price;
  }

  // Get WPLS price from stablecoin pairs with retry
  const priceData = await withRetry(
    () => getStablecoinPairPrice(WPLS_ADDRESS, provider),
    3,
    100
  );
  
  const price = priceData ? priceData.price : 0.0027; // Fallback price
  
  // Cache the result
  wplsCache = { price, timestamp: Date.now() };
  
  return price;
}

export async function getTokenPriceFromContract(tokenAddress: string): Promise<PriceData | null> {
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const cached = priceCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const provider = getProvider();
    
    // Special case for WPLS
    if (normalizedAddress === WPLS_ADDRESS.toLowerCase()) {
      const price = await getWPLSPrice(provider);
      const data: PriceData = {
        price,
        liquidity: 1000000, // WPLS has high liquidity
        pairAddress: '',
        token0: WPLS_ADDRESS,
        token1: ''
      };
      priceCache.set(normalizedAddress, { data, timestamp: Date.now() });
      return data;
    }
    
    // Try stablecoin pairs first for direct USD price (with retry)
    const stablecoinPrice = await withRetry(
      () => getStablecoinPairPrice(tokenAddress, provider),
      3,
      100
    );
    
    if (stablecoinPrice) {
      priceCache.set(normalizedAddress, { data: stablecoinPrice, timestamp: Date.now() });
      return stablecoinPrice;
    }
    
    // Fall back to WPLS pair (with retry)
    const wplsPrice = await withRetry(
      () => getWPLSPairPrice(tokenAddress, provider),
      3,
      100
    );
    
    if (wplsPrice) {
      priceCache.set(normalizedAddress, { data: wplsPrice, timestamp: Date.now() });
      return wplsPrice;
    }
    
    return null;
  } catch (error) {
    throw new PriceServiceError(
      `Failed to fetch token price from contract`,
      tokenAddress,
      'getTokenPriceFromContract',
      error
    );
  }
}

// Optimized batch function with better error handling
export async function getMultipleTokenPricesFromContract(
  tokenAddresses: string[]
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();
  
  // Process in batches to avoid overwhelming the RPC
  const BATCH_SIZE = 10;
  for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
    const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel with proper error handling
    const promises = batch.map(address => 
      getTokenPriceFromContract(address)
        .then(data => ({ address: address.toLowerCase(), data, error: null }))
        .catch(error => ({ 
          address: address.toLowerCase(), 
          data: null, 
          error: error instanceof PriceServiceError ? error : new PriceServiceError(
            'Unknown error',
            address,
            'batch processing',
            error
          )
        }))
    );
    
    const batchResults = await Promise.all(promises);
    
    for (const { address, data, error } of batchResults) {
      if (data) {
        results.set(address, data);
      } else if (error) {
        console.error(`Failed to get price for ${address}:`, error.message);
      }
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < tokenAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return results;
}