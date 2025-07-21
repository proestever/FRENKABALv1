/**
 * Server-side smart contract price service for fetching real-time token prices
 * directly from PulseChain liquidity pools
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

// Special cache for WPLS price (1 minute TTL)
let wplsCache: { price: number; timestamp: number } | null = null;
const WPLS_CACHE_TTL = 60 * 1000; // 1 minute

async function getTokenDecimals(tokenAddress: string, provider: ethers.providers.Provider): Promise<number> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await tokenContract.decimals();
  } catch (error) {
    console.error(`Error getting decimals for ${tokenAddress}:`, error);
    return 18; // Default to 18 decimals
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

async function getStablecoinPairPrice(tokenAddress: string, provider: ethers.providers.Provider): Promise<PriceData | null> {
  const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);
  
  for (const stablecoin of STABLECOINS) {
    try {
      const pairAddress = await factory.getPair(tokenAddress, stablecoin);
      if (pairAddress === ethers.constants.AddressZero) continue;
      
      const pairData = await getPairReserves(pairAddress, provider);
      if (!pairData) continue;
      
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
      
      if (tokenAmount === 0) continue;
      
      const price = stableAmount / tokenAmount;
      const liquidity = stableAmount * 2; // Total liquidity in USD
      
      // Return price data without liquidity filter
      return { price, liquidity, pairAddress, token0: pairData.token0, token1: pairData.token1 };
    } catch (error) {
      console.error(`Error checking stablecoin pair with ${stablecoin}:`, error);
    }
  }
  
  return null;
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
    
    return { price, liquidity, pairAddress, token0: pairData.token0, token1: pairData.token1 };
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

  // Get WPLS price from stablecoin pairs
  const priceData = await getStablecoinPairPrice(WPLS_ADDRESS, provider);
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
    
    // Try stablecoin pairs first for direct USD price
    const stablecoinPrice = await getStablecoinPairPrice(tokenAddress, provider);
    if (stablecoinPrice) {
      priceCache.set(normalizedAddress, { data: stablecoinPrice, timestamp: Date.now() });
      return stablecoinPrice;
    }
    
    // Fall back to WPLS pair
    const wplsPrice = await getWPLSPairPrice(tokenAddress, provider);
    if (wplsPrice) {
      priceCache.set(normalizedAddress, { data: wplsPrice, timestamp: Date.now() });
      return wplsPrice;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching token price from contract for ${tokenAddress}:`, error);
    return null;
  }
}

// Export batch function for efficiency
export async function getMultipleTokenPricesFromContract(
  tokenAddresses: string[]
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();
  
  // Process in batches to avoid overwhelming the RPC
  const BATCH_SIZE = 10;
  for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
    const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
    const promises = batch.map(address => 
      getTokenPriceFromContract(address)
        .then(data => ({ address: address.toLowerCase(), data }))
        .catch(() => ({ address: address.toLowerCase(), data: null }))
    );
    
    const batchResults = await Promise.all(promises);
    for (const { address, data } of batchResults) {
      if (data) {
        results.set(address, data);
      }
    }
  }
  
  return results;
}