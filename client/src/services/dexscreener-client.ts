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
const CACHE_TTL = 0; // Disabled for debugging

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

    // Debug for PulseReflection
    if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
      console.log(`=== All pairs for PulseReflection from DexScreener ===`);
      console.log(`Total pairs found: ${data.pairs.length}`);
      data.pairs.forEach(pair => {
        console.log(`Pair: ${pair.pairAddress}`);
        console.log(`  Base: ${pair.baseToken.symbol} (${pair.baseToken.address})`);
        console.log(`  Quote: ${pair.quoteToken.symbol} (${pair.quoteToken.address})`);
        console.log(`  Price USD: $${pair.priceUsd}`);
        console.log(`  Liquidity: $${pair.liquidity?.usd}`);
        console.log(`  Chain: ${pair.chainId}`);
        
        // Check if this is the specific pair mentioned
        if (pair.pairAddress.toLowerCase() === '0x53264c3ee2e1b1f470c9884e7f9ae03613868a96') {
          console.log(`  *** THIS IS THE MAIN PAIR ***`);
        }
      });
    }

    // Filter for PulseChain pairs - include pairs where token can be either BASE or QUOTE
    const validPairs = data.pairs.filter(pair => {
      const isOurToken = pair.baseToken.address.toLowerCase() === normalizedAddress || 
                        pair.quoteToken.address.toLowerCase() === normalizedAddress;
      return pair.chainId === 'pulsechain' && 
             isOurToken &&
             pair.priceUsd && 
             pair.liquidity?.usd;
    });

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

    // Calculate the correct price based on whether token is base or quote
    let finalPrice: number;
    const isBase = bestPair.baseToken.address.toLowerCase() === normalizedAddress;
    
    if (isBase) {
      // Token is the base token, price is already correct
      finalPrice = parseFloat(bestPair.priceUsd!);
    } else {
      // Token is the quote token, we need to calculate the price
      // If base token price is X USD and 1 base = Y quote tokens
      // Then 1 quote token = X/Y USD
      const basePrice = parseFloat(bestPair.priceUsd!);
      const priceNative = parseFloat(bestPair.priceNative);
      
      if (priceNative > 0) {
        finalPrice = basePrice / priceNative;
      } else {
        console.error(`Invalid priceNative for pair ${bestPair.pairAddress}`);
        return null;
      }
    }

    // Debug for PulseReflection
    if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
      console.log(`Selected pair: ${bestPair.pairAddress}`);
      console.log(`Token is ${isBase ? 'BASE' : 'QUOTE'} in this pair`);
      console.log(`Base price: $${bestPair.priceUsd}, Native price: ${bestPair.priceNative}`);
      console.log(`Final calculated price: $${finalPrice}`);
    }

    // Try to get logo from the token info
    let logo: string | undefined;
    if (bestPair.baseToken.address.toLowerCase() === normalizedAddress) {
      // Check if DexScreener provides a logo URL (they might add this in future)
      // For now, we'll leave it undefined and let the server provide stored logos
      logo = undefined;
    }

    const result: TokenPriceData = {
      price: finalPrice,
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