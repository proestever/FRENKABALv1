/**
 * DexScreener logo fetching service
 * Fetches token logos directly from DexScreener API in the browser
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
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd?: number;
    base: number;
    quote: number;
  };
  info?: {
    imageUrl?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';

/**
 * Fetch token logo from DexScreener
 * Returns the logo URL if found
 */
export async function fetchTokenLogoFromDexScreener(tokenAddress: string): Promise<string | null> {
  try {
    // Normalize address
    const address = tokenAddress.toLowerCase();
    
    // Special case for native token
    if (address === 'native' || address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return null; // Use default PLS logo
    }
    
    console.log(`Fetching logo from DexScreener for ${tokenAddress}`);
    
    const response = await fetch(`${DEXSCREENER_API_BASE}/tokens/${address}`, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.log(`DexScreener API returned ${response.status} for ${tokenAddress}`);
      return null;
    }
    
    const data = await response.json();
    
    // Look for pairs on PulseChain
    const pairs = data.pairs as DexScreenerPair[] || [];
    const pulseChainPairs = pairs.filter(pair => pair.chainId === 'pulsechain');
    
    if (pulseChainPairs.length === 0) {
      console.log(`No PulseChain pairs found for ${tokenAddress}`);
      return null;
    }
    
    // Try to find logo from pair info
    for (const pair of pulseChainPairs) {
      if (pair.info?.imageUrl) {
        console.log(`Found logo for ${tokenAddress}: ${pair.info.imageUrl}`);
        return pair.info.imageUrl;
      }
    }
    
    // Try to extract logo from base/quote tokens
    for (const pair of pulseChainPairs) {
      // Check if this token is the base token
      if (pair.baseToken.address.toLowerCase() === address) {
        // Sometimes DexScreener embeds the logo in the URL
        const possibleLogoUrl = `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${address}.png`;
        console.log(`Trying default logo URL for ${tokenAddress}: ${possibleLogoUrl}`);
        return possibleLogoUrl;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching logo from DexScreener for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Batch fetch multiple token logos
 * More efficient than individual calls
 */
export async function fetchMultipleTokenLogos(tokenAddresses: string[]): Promise<Map<string, string | null>> {
  const logoMap = new Map<string, string | null>();
  
  // Process in batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  const batches: string[][] = [];
  
  for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
    batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
  }
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    console.log(`Fetching logos for batch ${batchIndex + 1}/${batches.length} (${batch.length} tokens)`);
    
    // Fetch logos in parallel for this batch
    const logoPromises = batch.map(async (address) => {
      const logo = await fetchTokenLogoFromDexScreener(address);
      return { address: address.toLowerCase(), logo };
    });
    
    const results = await Promise.all(logoPromises);
    
    // Add to map
    results.forEach(({ address, logo }) => {
      logoMap.set(address, logo);
    });
    
    // Small delay between batches to respect rate limits
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return logoMap;
}