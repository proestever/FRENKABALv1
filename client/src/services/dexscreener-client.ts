/**
 * Client-side DexScreener API service
 * Calls DexScreener directly from the browser to avoid server load
 */

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
  priceUsd?: string;
  txns?: {
    m5: {
      buys: number;
      sells: number;
    };
    h1: {
      buys: number;
      sells: number;
    };
    h6: {
      buys: number;
      sells: number;
    };
    h24: {
      buys: number;
      sells: number;
    };
  };
  volume?: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange?: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

interface TokenPriceData {
  price: number;
  priceChange24h: number;
  liquidityUsd: number;
  volumeUsd24h: number;
  dexId: string;
  pairAddress: string;
}

// Client-side cache
const priceCache = new Map<string, { data: TokenPriceData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<TokenPriceData | null> {
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const cached = priceCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    
    if (!response.ok) {
      console.error(`DexScreener API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: DexScreenerResponse = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`No pairs found for token ${tokenAddress}`);
      return null;
    }

    // Filter for PulseChain pairs only
    const validPairs = data.pairs.filter(pair => 
      pair.chainId === 'pulsechain' && 
      pair.priceUsd && 
      pair.liquidity?.usd && 
      pair.liquidity.usd >= 1000
    );

    if (validPairs.length === 0) {
      console.log(`No valid PulseChain pairs found for token ${tokenAddress}`);
      return null;
    }

    // Use quality scoring with preference for WPLS pairs
    let bestPair: DexScreenerPair | null = null;
    let bestScore = 0;
    const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'.toLowerCase();

    for (const pair of validPairs) {
      let score = 0;
      
      // Check if this is a WPLS pair (either base or quote token)
      const isWPLSPair = pair.baseToken.address.toLowerCase() === WPLS_ADDRESS || 
                         pair.quoteToken.address.toLowerCase() === WPLS_ADDRESS;
      
      // Base score from liquidity with higher weight
      const liquidityScore = Math.min(pair.liquidity!.usd / 1000, 5000); // Cap at 5M
      score += liquidityScore * 2; // Double weight for liquidity
      
      // Major bonus for WPLS pairs (typically more reliable)
      if (isWPLSPair) {
        score *= 2; // Double the score for WPLS pairs
        console.log(`WPLS pair found: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}, liquidity: $${pair.liquidity!.usd.toLocaleString()}`);
      }
      
      // Bonus for volume
      if (pair.volume?.h24) {
        score += Math.min(pair.volume.h24 / 100, 100);
      }
      
      // Bonus for transaction activity
      if (pair.txns?.h24) {
        const totalTxns = (pair.txns.h24.buys || 0) + (pair.txns.h24.sells || 0);
        score += Math.min(totalTxns, 50);
      }
      
      // Penalty for extreme price ratios (outlier detection)
      if (validPairs.length > 1) {
        const prices = validPairs.map(p => parseFloat(p.priceUsd!));
        const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
        const price = parseFloat(pair.priceUsd!);
        const priceRatio = price / medianPrice;
        
        if (priceRatio > 10 || priceRatio < 0.1) {
          score *= 0.1;
          console.log(`Price outlier detected: $${price} vs median $${medianPrice}`);
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }

    if (!bestPair) {
      console.log(`No suitable pair found for token ${tokenAddress}`);
      return null;
    }

    const result: TokenPriceData = {
      price: parseFloat(bestPair.priceUsd!),
      priceChange24h: bestPair.priceChange?.h24 || 0,
      liquidityUsd: bestPair.liquidity!.usd,
      volumeUsd24h: bestPair.volume?.h24 || 0,
      dexId: bestPair.dexId,
      pairAddress: bestPair.pairAddress
    };

    // Cache the result
    priceCache.set(normalizedAddress, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error(`Error fetching price from DexScreener for ${tokenAddress}:`, error);
    return null;
  }
}

export async function getBatchTokenPrices(tokenAddresses: string[]): Promise<Record<string, TokenPriceData>> {
  const results: Record<string, TokenPriceData> = {};
  
  // Process in batches to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    
    const promises = batch.map(async (address) => {
      const price = await getTokenPriceFromDexScreener(address);
      if (price) {
        results[address.toLowerCase()] = price;
      }
    });
    
    await Promise.all(promises);
    
    // Small delay between batches to be respectful to the API
    if (i + batchSize < tokenAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}