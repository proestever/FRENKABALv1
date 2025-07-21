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
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
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

    // Filter for PulseChain pairs - include both base and quote token pairs
    // Lower the liquidity requirement to catch small pairs
    const allPairs = data.pairs.filter(pair => 
      pair.chainId === 'pulsechain' && 
      pair.priceUsd && 
      pair.liquidity?.usd !== undefined // Don't require minimum liquidity
    );

    // Separate pairs where our token is base vs quote
    const basePairs = allPairs.filter(pair => 
      pair.baseToken.address.toLowerCase() === normalizedAddress
    );
    
    const quotePairs = allPairs.filter(pair => 
      pair.quoteToken.address.toLowerCase() === normalizedAddress
    );

    console.log(`Found ${basePairs.length} base pairs and ${quotePairs.length} quote pairs for ${tokenAddress}`);
    
    // Log details about small pairs
    if (allPairs.length > 0) {
      const smallPairs = allPairs.filter(p => (p.liquidity?.usd || 0) < 1000);
      if (smallPairs.length > 0) {
        console.log(`Including ${smallPairs.length} small pairs (< $1k liquidity) for ${tokenAddress}`);
      }
    }

    // Prefer base pairs but fall back to quote pairs if needed
    let validPairs = basePairs.length > 0 ? basePairs : quotePairs;
    
    if (validPairs.length === 0) {
      console.log(`No valid PulseChain pairs found for token ${tokenAddress}`);
      // Log all pairs for debugging
      if (data.pairs.length > 0) {
        console.log(`All pairs for token: ${data.pairs.map(p => `${p.baseToken.symbol}/${p.quoteToken.symbol} on ${p.chainId}`).join(', ')}`);
      }
      return null;
    }

    // If we're using quote pairs, we need to invert the price
    const usingQuotePairs = basePairs.length === 0;

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
        
        // Base score from liquidity - be more generous with small pairs
        const liquidity = pair.liquidity?.usd || 0;
        const liquidityScore = liquidity > 0 ? Math.log10(liquidity + 1) * 100 : 0;
        score += liquidityScore;
        
        // Bonus for volume - weighted less heavily
        if (pair.volume?.h24) {
          const volumeScore = Math.log10(pair.volume.h24 + 1) * 10;
          score += volumeScore;
        }
        
        // Bonus for transaction activity
        if (pair.txns?.h24) {
          const totalTxns = (pair.txns.h24.buys || 0) + (pair.txns.h24.sells || 0);
          score += Math.min(totalTxns, 50);
        }
        
        // Bonus for pairs with stable coins
        const stableAddresses = [
          '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07', // USDC
          '0xefd766ccb38eaf1dfd701853bfce31359239f305', // DAI
          '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', // USDT
        ].map(a => a.toLowerCase());
        
        if (stableAddresses.includes(pair.quoteToken.address.toLowerCase()) ||
            stableAddresses.includes(pair.baseToken.address.toLowerCase())) {
          score += 50; // Prefer stablecoin pairs for accuracy
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
    if (bestPair.info?.imageUrl) {
      logo = bestPair.info.imageUrl;
    }
    
    // Debug logging for specific tokens
    if (normalizedAddress === '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d' || 
        normalizedAddress === '0x95b303987a60c71504d99aa1b13b4da07b0790ab') {
      console.log(`DexScreener response for ${normalizedAddress}:`, {
        symbol: bestPair.baseToken.symbol,
        hasInfo: !!bestPair.info,
        imageUrl: bestPair.info?.imageUrl,
        logo: logo
      });
    }

    // Calculate the correct price based on whether we're using quote pairs
    let tokenPrice = parseFloat(bestPair.priceUsd!);
    
    if (usingQuotePairs) {
      // If our token is the quote token, we need to calculate its price
      // The pair price is baseToken/quoteToken, so quoteToken price = baseToken price / pair price ratio
      const baseTokenPrice = parseFloat(bestPair.priceUsd!);
      const pairPrice = bestPair.priceNative ? parseFloat(bestPair.priceNative) : 1;
      
      // For quote pairs, the token price needs special handling
      // We'll use the baseToken's USD price if available
      if (bestPair.baseToken.address.toLowerCase() === WPLS_ADDRESS) {
        // If paired with WPLS, use WPLS price to calculate token price
        tokenPrice = baseTokenPrice / pairPrice;
      } else {
        // For other pairs, we might need to fetch the base token's price
        // For now, we'll use the pair's liquidity to estimate
        console.log(`Using quote pair for ${tokenAddress}, may need price adjustment`);
      }
    }

    const result: TokenPriceData = {
      price: tokenPrice,
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