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

export interface TokenPriceData {
  price: number;
  priceChange24h: number;
  liquidityUsd: number;
  volumeUsd24h: number;
  dexId: string;
  pairAddress: string;
  logo?: string;
}

// Client-side cache
const priceCache = new Map<string, { data: TokenPriceData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Known stablecoin addresses on PulseChain (from Ethereum bridge)
const STABLECOINS: Record<string, { name: string; logo: string }> = {
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': {
    name: 'DAI from Ethereum',
    logo: 'https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png' // DAI logo
  },
  '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': {
    name: 'USDT from Ethereum',
    logo: 'https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png' // USDT logo
  },
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': {
    name: 'USDC from Ethereum',
    logo: 'https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png' // USDC logo
  }
};

export async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<TokenPriceData | null> {
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check if it's a known stablecoin first
  if (STABLECOINS[normalizedAddress]) {
    const stablecoinData: TokenPriceData = {
      price: 1.0,
      priceChange24h: 0,
      liquidityUsd: 0,
      volumeUsd24h: 0,
      dexId: 'stablecoin',
      pairAddress: '',
      logo: STABLECOINS[normalizedAddress].logo
    };
    
    // Cache the stablecoin data
    priceCache.set(normalizedAddress, {
      data: stablecoinData,
      timestamp: Date.now()
    });
    
    console.log(`Returning stablecoin price for ${STABLECOINS[normalizedAddress].name}: $1.00`);
    return stablecoinData;
  }
  
  // Check cache for non-stablecoins
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

    // Filter for PulseChain pairs only where our token is the BASE token
    const validPairs = data.pairs.filter(pair => 
      pair.chainId === 'pulsechain' && 
      pair.baseToken.address.toLowerCase() === normalizedAddress && // Only pairs where token is base
      pair.priceUsd && 
      pair.liquidity?.usd && 
      pair.liquidity.usd >= 1000
    );

    if (validPairs.length === 0) {
      console.log(`No valid PulseChain pairs found for token ${tokenAddress}`);
      return null;
    }

    // First, try to find the largest WPLS pair
    const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'.toLowerCase();
    const wplsPairs = validPairs.filter(pair => 
      pair.baseToken.address.toLowerCase() === WPLS_ADDRESS || 
      pair.quoteToken.address.toLowerCase() === WPLS_ADDRESS
    );
    
    let bestPair: DexScreenerPair | null = null;
    
    if (wplsPairs.length > 0) {
      // If WPLS pairs exist, use the one with highest liquidity
      bestPair = wplsPairs.reduce((best, current) => {
        return current.liquidity!.usd > best.liquidity!.usd ? current : best;
      });
      console.log(`Using WPLS pair: ${bestPair.baseToken.symbol}/${bestPair.quoteToken.symbol}, liquidity: $${bestPair.liquidity!.usd.toLocaleString()}`);
    } else {
      // Fallback to quality scoring if no WPLS pairs exist
      console.log(`No WPLS pairs found, using quality scoring`);
      let bestScore = 0;
      
      for (const pair of validPairs) {
        let score = 0;
        
        // Base score from liquidity
        const liquidityScore = Math.min(pair.liquidity!.usd / 1000, 5000);
        score += liquidityScore * 2;
        
        // Bonus for volume
        if (pair.volume?.h24) {
          score += Math.min(pair.volume.h24 / 100, 100);
        }
        
        // Bonus for transaction activity
        if (pair.txns?.h24) {
          const totalTxns = (pair.txns.h24.buys || 0) + (pair.txns.h24.sells || 0);
          score += Math.min(totalTxns, 50);
        }
        
        // Penalty for extreme price ratios
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
    }

    if (!bestPair) {
      console.log(`No suitable pair found for token ${tokenAddress}`);
      return null;
    }

    // Try to get logo from the token info
    let logo: string | undefined;
    if (bestPair.baseToken.address.toLowerCase() === normalizedAddress) {
      // Check if DexScreener provides a logo URL (they might add this in future)
      // For now, we'll leave it undefined and let the server provide stored logos
      logo = undefined;
    }

    const result: TokenPriceData = {
      price: parseFloat(bestPair.priceUsd!),
      priceChange24h: bestPair.priceChange?.h24 || 0,
      liquidityUsd: bestPair.liquidity!.usd,
      volumeUsd24h: bestPair.volume?.h24 || 0,
      dexId: bestPair.dexId,
      pairAddress: bestPair.pairAddress,
      logo
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