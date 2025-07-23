/**
 * Server-side smart contract price service for fetching real-time token prices
 * directly from PulseChain liquidity pools
 */

import { ethers } from "ethers";
import { getProvider } from "./rpc-provider";

interface PriceData {
  price: number;
  liquidity: number;
  pairAddress: string;
  token0: string;
  token1: string;
}

// ABIs
const PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function totalSupply() view returns (uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
];

// Constants
const PULSEX_V2_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";
const PULSEX_V1_FACTORY = "0x29eA7545DEf87022BAdc76323F373EA1e707C523";
const WPLS_ADDRESS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";

// WPLS/DAI pair - foundation for all price calculations
const WPLS_DAI_PAIR = "0xe56043671df55de5cdf8459710433c10324de0ae";
const DAI_ADDRESS = "0xefD766cCb38EaF1dfd701853BFCe31359239F305"; // DAI from Ethereum

// Stablecoin addresses on PulseChain
const STABLECOINS = [
  "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", // USDC from Ethereum
  "0xefD766cCb38EaF1dfd701853BFCe31359239F305", // DAI from Ethereum
  "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f", // USDT from Ethereum
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
];

// No caching - always fetch fresh prices from blockchain
const priceCache = new Map<string, { data: PriceData; timestamp: number }>();
const CACHE_TTL = 0; // Disabled - always fetch fresh

// No caching for WPLS price either
let wplsCache: { price: number; timestamp: number } | null = null;
const WPLS_CACHE_TTL = 0; // Disabled - always fetch fresh

async function getTokenDecimals(
  tokenAddress: string,
  provider: ethers.providers.Provider,
): Promise<number> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider,
    );
    return await tokenContract.decimals();
  } catch (error) {
    console.error(`Error getting decimals for ${tokenAddress}:`, error);
    return 18; // Default to 18 decimals
  }
}

async function getPairReserves(
  pairAddress: string,
  provider: ethers.providers.Provider,
): Promise<{
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
      pairContract.token1(),
    ]);

    return {
      reserve0: reserves[0],
      reserve1: reserves[1],
      token0,
      token1,
    };
  } catch (error) {
    console.error(`Error getting reserves for pair ${pairAddress}:`, error);
    return null;
  }
}

async function getStablecoinPairPrice(
  tokenAddress: string,
  provider: ethers.providers.Provider,
): Promise<PriceData | null> {
  // Try both v2 and v1 factories
  const factories = [PULSEX_V2_FACTORY, PULSEX_V1_FACTORY];
  
  for (const factoryAddress of factories) {
    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
    
    for (const stablecoin of STABLECOINS) {
      try {
        const pairAddress = await factory.getPair(tokenAddress, stablecoin);
        if (pairAddress === ethers.constants.AddressZero) continue;

      const pairData = await getPairReserves(pairAddress, provider);
      if (!pairData) continue;

      const [tokenDecimals, stableDecimals] = await Promise.all([
        getTokenDecimals(tokenAddress, provider),
        getTokenDecimals(stablecoin, provider),
      ]);

      // Determine which token is which
      const isToken0 =
        pairData.token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
      const stableReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;

      // Calculate price
      const tokenAmount = parseFloat(
        ethers.utils.formatUnits(tokenReserve, tokenDecimals),
      );
      const stableAmount = parseFloat(
        ethers.utils.formatUnits(stableReserve, stableDecimals),
      );

      if (tokenAmount === 0) continue;

      const price = stableAmount / tokenAmount;
      const liquidity = stableAmount * 2; // Total liquidity in USD

      // Return price data without liquidity filter
      return {
        price,
        liquidity,
        pairAddress,
        token0: pairData.token0,
        token1: pairData.token1,
      };
      } catch (error) {
        console.error(
          `Error checking stablecoin pair with ${stablecoin}:`,
          error,
        );
      }
    }
  }

  return null;
}

async function getWPLSPairPrice(
  tokenAddress: string,
  provider: ethers.providers.Provider,
): Promise<PriceData | null> {
  // Find ALL WPLS pairs from both v2 and v1 factories
  const factories = [
    { address: PULSEX_V2_FACTORY, name: 'V2' },
    { address: PULSEX_V1_FACTORY, name: 'V1' }
  ];
  
  const allPairs: PriceData[] = [];
  
  for (const factory of factories) {
    try {
      const factoryContract = new ethers.Contract(factory.address, FACTORY_ABI, provider);
      const pairAddress = await factoryContract.getPair(tokenAddress, WPLS_ADDRESS);

      if (pairAddress === ethers.constants.AddressZero) continue;

      const pairData = await getPairReserves(pairAddress, provider);
      if (!pairData) continue;

      const [tokenDecimals, wplsDecimals] = await Promise.all([
        getTokenDecimals(tokenAddress, provider),
        getTokenDecimals(WPLS_ADDRESS, provider),
      ]);

      // Determine which token is which
      const isToken0 =
        pairData.token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
      const wplsReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;

      // Calculate price in WPLS
      const tokenAmount = parseFloat(
        ethers.utils.formatUnits(tokenReserve, tokenDecimals),
      );
      const wplsAmount = parseFloat(
        ethers.utils.formatUnits(wplsReserve, wplsDecimals),
      );

      if (tokenAmount === 0) continue;

      const priceInWPLS = wplsAmount / tokenAmount;

      // Get WPLS price in USD
      const wplsPrice = await getWPLSPrice(provider);
      const price = priceInWPLS * wplsPrice;
      const liquidity = wplsAmount * wplsPrice * 2; // Total liquidity in USD

      // Don't filter by liquidity - we'll select the highest liquidity pair later

      console.log(`Found ${tokenAddress} WPLS pair on ${factory.name}: $${price.toFixed(8)}, liquidity: $${liquidity.toFixed(2)}, pair: ${pairAddress}`);
      
      allPairs.push({
        price,
        liquidity,
        pairAddress,
        token0: pairData.token0,
        token1: pairData.token1,
      });
    } catch (error) {
      console.error(`Error getting WPLS pair price for ${tokenAddress} on ${factory.name}:`, error);
    }
  }
  
  // If we found multiple pairs, return the one with highest liquidity
  if (allPairs.length > 0) {
    const bestPair = allPairs.reduce((best, current) => 
      current.liquidity > best.liquidity ? current : best
    );
    
    if (allPairs.length > 1) {
      console.log(`Selected highest liquidity pair for ${tokenAddress}: $${bestPair.liquidity.toFixed(2)}, price: $${bestPair.price.toFixed(8)}`);
    }
    
    return bestPair;
  }
  
  return null;
}

// Find ALL pairs for a token across both factories
async function findAllPairsForToken(
  tokenAddress: string,
  provider: ethers.providers.Provider,
): Promise<Array<{ pairAddress: string; factoryAddress: string; otherToken: string }>> {
  const pairs: Array<{ pairAddress: string; factoryAddress: string; otherToken: string }> = [];
  const factories = [
    { address: PULSEX_V2_FACTORY, name: 'V2' },
    { address: PULSEX_V1_FACTORY, name: 'V1' }
  ];
  
  // Common tokens to check pairs with
  const commonTokens = [
    WPLS_ADDRESS,
    ...STABLECOINS,
    "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // HEX
    "0x95b303987a60c71504d99aa1b13b4da07b0790ab", // PLSX
    "0x57fde0a71132198bbec939b98976993d8d89d225", // INC
  ];
  
  for (const factory of factories) {
    try {
      const factoryContract = new ethers.Contract(factory.address, FACTORY_ABI, provider);
      
      // Check pairs with common tokens
      for (const otherToken of commonTokens) {
        if (otherToken.toLowerCase() === tokenAddress.toLowerCase()) continue;
        
        try {
          const pairAddress = await factoryContract.getPair(tokenAddress, otherToken);
          if (pairAddress !== ethers.constants.AddressZero) {
            pairs.push({
              pairAddress,
              factoryAddress: factory.address,
              otherToken
            });
          }
        } catch (error) {
          // Skip errors for individual pairs
        }
      }
    } catch (error) {
      console.error(`Error checking factory ${factory.name}:`, error);
    }
  }
  
  return pairs;
}

async function getWPLSPrice(
  provider: ethers.providers.Provider,
): Promise<number> {
  // Check cache first
  if (wplsCache && Date.now() - wplsCache.timestamp < WPLS_CACHE_TTL) {
    return wplsCache.price;
  }

  try {
    // Always use the WPLS/DAI pair as the foundation for WPLS price
    const pairContract = new ethers.Contract(WPLS_DAI_PAIR, PAIR_ABI, provider);
    const [reserves, token0] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
    ]);

    // Both WPLS and DAI have 18 decimals
    const isWPLSToken0 = token0.toLowerCase() === WPLS_ADDRESS.toLowerCase();
    const wplsReserve = isWPLSToken0 ? reserves[0] : reserves[1];
    const daiReserve = isWPLSToken0 ? reserves[1] : reserves[0];

    const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, 18));
    const daiAmount = parseFloat(ethers.utils.formatUnits(daiReserve, 18));

    if (wplsAmount === 0) {
      console.error('WPLS amount is 0 in WPLS/DAI pair');
      return 0.000032; // Fallback price
    }

    const price = daiAmount / wplsAmount;
    console.log(`WPLS price from WPLS/DAI pair: $${price.toFixed(6)} (${wplsAmount.toFixed(2)} WPLS / ${daiAmount.toFixed(2)} DAI)`);

    // Cache the result
    wplsCache = { price, timestamp: Date.now() };

    return price;
  } catch (error) {
    console.error('Error fetching WPLS price from WPLS/DAI pair:', error);
    return 0.000032; // Fallback price
  }
}

export async function getTokenPriceFromContract(
  tokenAddress: string,
): Promise<PriceData | null> {
  const normalizedAddress = tokenAddress.toLowerCase();

  // Check cache first
  const cached = priceCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Debug logging for PulseReflection
  if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
    console.log('=== Fetching price for PulseReflection ===');
  }

  try {
    const provider = getProvider();

    // Special case for WPLS
    if (normalizedAddress === WPLS_ADDRESS.toLowerCase()) {
      const price = await getWPLSPrice(provider);
      const data: PriceData = {
        price,
        liquidity: 1000000, // WPLS has high liquidity
        pairAddress: "",
        token0: WPLS_ADDRESS,
        token1: "",
      };
      priceCache.set(normalizedAddress, { data, timestamp: Date.now() });
      return data;
    }

    // Special case for PulseReflection (PRS) - use the correct pair
    if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
      console.log('Using specific pair for PulseReflection');
      const correctPairAddress = '0x53264c3eE2e1B1f470C9884e7f9AE03613868a96'; // PRS/WPLS pair from DexScreener
      
      try {
        const pairData = await getPairReserves(correctPairAddress, provider);
        if (pairData) {
          const isToken0 = pairData.token0.toLowerCase() === normalizedAddress;
          const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
          const wplsReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;
          
          const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, 18)); // PRS has 18 decimals
          const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, 18));
          
          if (tokenAmount > 0) {
            const wplsPrice = await getWPLSPrice(provider);
            const price = (wplsAmount / tokenAmount) * wplsPrice;
            const liquidity = wplsAmount * wplsPrice * 2;
            
            console.log(`PRS price from correct pair: $${price.toFixed(12)} (liquidity: $${liquidity.toFixed(2)})`);
            
            const data: PriceData = {
              price,
              liquidity,
              pairAddress: correctPairAddress,
              token0: pairData.token0,
              token1: pairData.token1,
            };
            priceCache.set(normalizedAddress, { data, timestamp: Date.now() });
            return data;
          }
        }
      } catch (error) {
        console.error('Error getting PRS price from specific pair:', error);
      }
    }

    // Find ALL pairs for the token
    const allPairsInfo = await findAllPairsForToken(tokenAddress, provider);
    
    // Debug for PulseReflection
    if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
      console.log(`Found ${allPairsInfo.length} pairs for PulseReflection:`);
      allPairsInfo.forEach(pair => {
        console.log(`  - Pair: ${pair.pairAddress} (${pair.factoryAddress === PULSEX_V2_FACTORY ? 'V2' : 'V1'}) with ${pair.otherToken}`);
      });
    }
    
    // Get price data for all pairs and separate by type
    const wplsPairs: Array<{ pair: PriceData; wplsAmount: number }> = [];
    const stablecoinPairs: PriceData[] = [];
    const otherPairs: PriceData[] = [];
    
    for (const pairInfo of allPairsInfo) {
      try {
        const pairData = await getPairReserves(pairInfo.pairAddress, provider);
        if (!pairData) continue;
        
        const isToken0 = pairData.token0.toLowerCase() === tokenAddress.toLowerCase();
        const otherTokenAddress = isToken0 ? pairData.token1 : pairData.token0;
        const tokenReserve = isToken0 ? pairData.reserve0 : pairData.reserve1;
        const otherReserve = isToken0 ? pairData.reserve1 : pairData.reserve0;
        
        const [tokenDecimals, otherDecimals] = await Promise.all([
          getTokenDecimals(tokenAddress, provider),
          getTokenDecimals(otherTokenAddress, provider),
        ]);
        
        const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, tokenDecimals));
        const otherAmount = parseFloat(ethers.utils.formatUnits(otherReserve, otherDecimals));
        
        if (tokenAmount === 0) continue;
        
        // Get price of the other token and categorize the pair
        let otherTokenPrice = 0;
        let pairType: 'wpls' | 'stablecoin' | 'other' = 'other';
        
        if (otherTokenAddress.toLowerCase() === WPLS_ADDRESS.toLowerCase()) {
          otherTokenPrice = await getWPLSPrice(provider);
          pairType = 'wpls';
        } else if (STABLECOINS.includes(otherTokenAddress.toLowerCase())) {
          otherTokenPrice = 1.0; // Stablecoins
          pairType = 'stablecoin';
        } else {
          // Skip pairs with tokens we can't price
          continue;
        }
        
        const price = (otherAmount / tokenAmount) * otherTokenPrice;
        const liquidity = otherAmount * otherTokenPrice * 2;
        
        // Debug for PulseReflection
        if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
          console.log(`  - Calculated price from pair ${pairInfo.pairAddress}:`);
          console.log(`    Token amount: ${tokenAmount}, Other amount: ${otherAmount}`);
          console.log(`    Other token price: $${otherTokenPrice}`);
          console.log(`    Calculated price: $${price}, Liquidity: $${liquidity}`);
          console.log(`    Pair type: ${pairType}`);
        }
        
        const priceData: PriceData = {
          price,
          liquidity,
          pairAddress: pairInfo.pairAddress,
          token0: pairData.token0,
          token1: pairData.token1,
        };
        
        // Categorize pairs by type
        if (pairType === 'wpls') {
          wplsPairs.push({ pair: priceData, wplsAmount: otherAmount });
        } else if (pairType === 'stablecoin') {
          stablecoinPairs.push(priceData);
        } else {
          otherPairs.push(priceData);
        }
      } catch (error) {
        console.error(`Error processing pair ${pairInfo.pairAddress}:`, error);
      }
    }
    
    // Debug for PulseReflection
    if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
      console.log(`Valid pairs for PulseReflection: ${wplsPairs.length} WPLS, ${stablecoinPairs.length} stablecoin, ${otherPairs.length} other`);
    }
    
    // Select the best pair - prioritize WPLS pairs with highest WPLS liquidity
    let bestPair: PriceData | null = null;
    
    if (wplsPairs.length > 0) {
      // Sort WPLS pairs by WPLS amount (liquidity) and select the highest
      const bestWplsPair = wplsPairs.reduce((best, current) => 
        current.wplsAmount > best.wplsAmount ? current : best
      );
      bestPair = bestWplsPair.pair;
      
      if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
        console.log(`Selected WPLS pair with ${bestWplsPair.wplsAmount} WPLS liquidity`);
      }
    } else if (stablecoinPairs.length > 0) {
      // If no WPLS pairs, use stablecoin pair with highest liquidity
      bestPair = stablecoinPairs.reduce((best, current) => 
        current.liquidity > best.liquidity ? current : best
      );
    } else if (otherPairs.length > 0) {
      // Last resort: use other pairs with highest liquidity
      bestPair = otherPairs.reduce((best, current) => 
        current.liquidity > best.liquidity ? current : best
      );
    }
    
    if (bestPair) {
      if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
        console.log(`Selected best pair for PulseReflection: ${bestPair.pairAddress} with price $${bestPair.price}`);
      }
      
      priceCache.set(normalizedAddress, {
        data: bestPair,
        timestamp: Date.now(),
      });
      return bestPair;
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching token price from contract for ${tokenAddress}:`,
      error,
    );
    return null;
  }
}

// Export batch function for efficiency
export async function getMultipleTokenPricesFromContract(
  tokenAddresses: string[],
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();

  // Process in batches to avoid overwhelming the RPC
  const BATCH_SIZE = 10;
  for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
    const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
    const promises = batch.map((address) =>
      getTokenPriceFromContract(address)
        .then((data) => ({ address: address.toLowerCase(), data }))
        .catch(() => ({ address: address.toLowerCase(), data: null })),
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
