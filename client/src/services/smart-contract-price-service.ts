import { ethers } from 'ethers';

// Multiple RPC endpoints for reliability - using only the most stable providers
const RPC_ENDPOINTS = [
  'https://rpc-pulsechain.g4mm4.io',
  'https://rpc.pulsechain.com'
];

// ABI for PulseX pair contracts (minimal required functions)
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)'
];

// ABI for ERC20 tokens (minimal)
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)'
];

// Factory ABI for finding pairs
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

// Known addresses - Multiple factories for finding best liquidity pairs
const PULSEX_FACTORIES = [
  '0x1715a3E4A142d8b698131108995174F37aEBA10D', // PulseX v2 Factory
  '0x29eA7545DEf87022BAdc76323F373EA1e707C523'  // PulseX v1 Factory
];
const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

// Stablecoin addresses for price calculation
const STABLECOINS = {
  '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07': { name: 'USDC', decimals: 6 },
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f': { name: 'USDT', decimals: 6 },
  '0xefD766cCb38EaF1dfd701853BFCe31359239F305': { name: 'DAI', decimals: 18 }
};

interface TokenReserves {
  token0Address: string;
  token1Address: string;
  reserve0: bigint;
  reserve1: bigint;
  decimals0: number;
  decimals1: number;
}

interface PriceData {
  price: number;
  pairAddress: string;
  pairedTokenSymbol: string;
  liquidity: number;
  lastUpdate: number;
}

class SmartContractPriceService {
  private providers: ethers.providers.JsonRpcProvider[] = [];
  private currentProviderIndex = 0;
  private priceCache = new Map<string, { data: PriceData; timestamp: number }>();
  private wplsPriceCache: { price: number; timestamp: number } | null = null;
  private CACHE_TTL = 2000; // 2 seconds cache for rapid updates

  constructor() {
    this.initializeProviders().catch(console.error);
  }

  private async initializeProviders() {
    // Initialize multiple providers for redundancy with network detection
    for (const url of RPC_ENDPOINTS) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(url, {
          chainId: 369,
          name: 'pulsechain',
          ensAddress: null // Disable ENS resolution on PulseChain
        });
        // Set a timeout for network detection
        const networkPromise = provider.detectNetwork();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network detection timeout')), 5000)
        );
        
        await Promise.race([networkPromise, timeoutPromise]);
        this.providers.push(provider);
      } catch (error) {
        console.warn(`Failed to initialize provider ${url}:`, error);
      }
    }
    
    if (this.providers.length === 0) {
      console.error('Failed to initialize any RPC providers');
    }
  }

  private getProvider(): ethers.providers.JsonRpcProvider | null {
    if (this.providers.length === 0) {
      console.error('No RPC providers available');
      return null;
    }
    
    // Round-robin through providers for load balancing
    const provider = this.providers[this.currentProviderIndex];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    return provider;
  }

  /**
   * Get real-time price for a token by reading directly from smart contracts
   */
  async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache first
    const cached = this.priceCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Special case for PulseReflection (PRS) - use the correct pair from DexScreener
      if (normalizedAddress === '0xb6b57227150a7097723e0c013752001aad01248f') {
        console.log('Using specific pair for PulseReflection');
        const correctPairAddress = '0x53264c3eE2e1B1f470C9884e7f9AE03613868a96'; // PRS/WPLS pair from DexScreener
        
        const provider = this.getProvider();
        if (!provider) return null;

        try {
          const reserves = await this.getPairReserves(correctPairAddress, tokenAddress, WPLS_ADDRESS);
          if (reserves) {
            const isToken0 = reserves.token0Address.toLowerCase() === normalizedAddress;
            const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
            const wplsReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
            
            const tokenAmount = Number(tokenReserve) / Math.pow(10, 18); // PRS has 18 decimals
            const wplsAmount = Number(wplsReserve) / Math.pow(10, 18);
            
            if (tokenAmount > 0) {
              const wplsPrice = await this.getWPLSPrice();
              if (wplsPrice) {
                const price = (wplsAmount / tokenAmount) * wplsPrice;
                const liquidity = wplsAmount * wplsPrice * 2;
                
                console.log(`PRS price from correct pair: $${price.toFixed(12)} (liquidity: $${liquidity.toFixed(2)})`);
                
                const priceData: PriceData = {
                  price,
                  pairAddress: correctPairAddress,
                  pairedTokenSymbol: 'WPLS',
                  liquidity,
                  lastUpdate: Date.now()
                };
                this.cachePrice(normalizedAddress, priceData);
                return priceData;
              }
            }
          }
        } catch (error) {
          console.error('Error getting PRS price from specific pair:', error);
        }
      }

      // First, try to find a stablecoin pair for direct USD price
      const stablecoinPrice = await this.getStablecoinPairPrice(tokenAddress);
      if (stablecoinPrice) {
        this.cachePrice(normalizedAddress, stablecoinPrice);
        return stablecoinPrice;
      }

      // If no stablecoin pair, try WPLS pair and calculate USD price
      const wplsPrice = await this.getWPLSPairPrice(tokenAddress);
      if (wplsPrice) {
        // Get WPLS price in USD first
        const wplsUsdPrice = await this.getWPLSPrice();
        if (wplsUsdPrice) {
          wplsPrice.price = wplsPrice.price * wplsUsdPrice;
          this.cachePrice(normalizedAddress, wplsPrice);
          return wplsPrice;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching token price from smart contract:', error);
      return null;
    }
  }

  /**
   * Get price from stablecoin pairs
   */
  private async getStablecoinPairPrice(tokenAddress: string): Promise<PriceData | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    // Try each stablecoin
    for (const [stableAddress, stableInfo] of Object.entries(STABLECOINS)) {
      // Check all factories
      for (const factoryAddress of PULSEX_FACTORIES) {
        try {
          const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
          const pairAddress = await factory.getPair(tokenAddress, stableAddress);
          
          if (pairAddress === ethers.constants.AddressZero) continue;

        const reserves = await this.getPairReserves(pairAddress, tokenAddress, stableAddress);
        if (!reserves) continue;

        // Calculate price
        const isToken0 = reserves.token0Address.toLowerCase() === tokenAddress.toLowerCase();
        const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
        const stableReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
        const tokenDecimals = isToken0 ? reserves.decimals0 : reserves.decimals1;
        const stableDecimals = isToken0 ? reserves.decimals1 : reserves.decimals0;

        // Calculate price: stableReserve / tokenReserve adjusted for decimals
        const price = Number(stableReserve) / Number(tokenReserve) * 
                     Math.pow(10, tokenDecimals - stableDecimals);

        // Calculate liquidity
        const stableLiquidity = Number(stableReserve) / Math.pow(10, stableDecimals);
        const liquidity = stableLiquidity * 2; // Total liquidity is roughly 2x one side

        return {
          price,
          pairAddress,
          pairedTokenSymbol: stableInfo.name,
          liquidity,
          lastUpdate: Date.now()
        };
        } catch (error) {
          // Continue to next factory
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Get price from WPLS pair
   */
  private async getWPLSPairPrice(tokenAddress: string): Promise<PriceData | null> {
    if (tokenAddress.toLowerCase() === WPLS_ADDRESS.toLowerCase()) {
      return null; // Can't get WPLS price from WPLS pair
    }

    const provider = this.getProvider();
    if (!provider) return null;

    // Find ALL WPLS pairs across all factories and select the one with highest WPLS liquidity
    const allPairs: Array<{ data: PriceData; wplsAmount: number }> = [];

    for (const factoryAddress of PULSEX_FACTORIES) {
      try {
        const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
        const pairAddress = await factory.getPair(tokenAddress, WPLS_ADDRESS);
        
        if (pairAddress === ethers.constants.AddressZero) continue;

        const reserves = await this.getPairReserves(pairAddress, tokenAddress, WPLS_ADDRESS);
        if (!reserves) continue;

        // Calculate price in WPLS
        const isToken0 = reserves.token0Address.toLowerCase() === tokenAddress.toLowerCase();
        const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
        const wplsReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
        const tokenDecimals = isToken0 ? reserves.decimals0 : reserves.decimals1;
        const wplsDecimals = isToken0 ? reserves.decimals1 : reserves.decimals0;

        const priceInWPLS = Number(wplsReserve) / Number(tokenReserve) * 
                            Math.pow(10, tokenDecimals - wplsDecimals);

        // Calculate liquidity in WPLS
        const wplsAmount = Number(wplsReserve) / Math.pow(10, wplsDecimals);
        const liquidity = wplsAmount * 2;

        // Skip pairs with less than 1,000,000 WPLS liquidity
        if (wplsAmount < 1_000_000) {
          console.log(`Skipping low liquidity pair for ${tokenAddress}: ${wplsAmount.toFixed(2)} WPLS`);
          continue;
        }

        allPairs.push({
          data: {
            price: priceInWPLS, // Will be converted to USD by caller
            pairAddress,
            pairedTokenSymbol: 'WPLS',
            liquidity: liquidity,
            lastUpdate: Date.now()
          },
          wplsAmount: wplsAmount
        });

        // Debug logging for PulseReflection
        if (tokenAddress.toLowerCase() === '0xb6b57227150a7097723e0c013752001aad01248f') {
          console.log(`Found WPLS pair in factory ${factoryAddress}: ${pairAddress}, WPLS amount: ${wplsAmount.toFixed(2)}`);
        }
      } catch (error) {
        // Continue to next factory
        continue;
      }
    }

    // Select the pair with highest WPLS amount (not total liquidity)
    if (allPairs.length > 0) {
      const bestPair = allPairs.reduce((best, current) => 
        current.wplsAmount > best.wplsAmount ? current : best
      );

      // Debug logging for PulseReflection
      if (tokenAddress.toLowerCase() === '0xb6b57227150a7097723e0c013752001aad01248f') {
        console.log(`Selected best WPLS pair: ${bestPair.data.pairAddress} with ${bestPair.wplsAmount.toFixed(2)} WPLS`);
      }

      return bestPair.data;
    }

    return null;
  }

  /**
   * Get WPLS price in USD from stablecoin pairs
   */
  private async getWPLSPrice(): Promise<number | null> {
    // Check cache first
    if (this.wplsPriceCache && Date.now() - this.wplsPriceCache.timestamp < this.CACHE_TTL) {
      return this.wplsPriceCache.price;
    }

    // Fetch fresh price
    const wplsPriceData = await this.getStablecoinPairPrice(WPLS_ADDRESS);
    if (wplsPriceData) {
      // Cache the price
      this.wplsPriceCache = {
        price: wplsPriceData.price,
        timestamp: Date.now()
      };
      return wplsPriceData.price;
    }
    
    return null;
  }

  /**
   * Get reserves and token info from a pair
   */
  private async getPairReserves(
    pairAddress: string, 
    token0Address: string, 
    token1Address: string
  ): Promise<TokenReserves | null> {
    const provider = this.getProvider();
    if (!provider) return null;
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);

    try {
      // Get pair tokens to determine order
      const [pairToken0, pairToken1] = await Promise.all([
        pair.token0(),
        pair.token1()
      ]);

      // Get reserves
      const reserves = await pair.getReserves();

      // Get decimals for both tokens
      const token0Contract = new ethers.Contract(pairToken0, ERC20_ABI, provider!);
      const token1Contract = new ethers.Contract(pairToken1, ERC20_ABI, provider!);
      
      const [decimals0, decimals1] = await Promise.all([
        token0Contract.decimals(),
        token1Contract.decimals()
      ]);

      return {
        token0Address: pairToken0,
        token1Address: pairToken1,
        reserve0: reserves[0],
        reserve1: reserves[1],
        decimals0: Number(decimals0),
        decimals1: Number(decimals1)
      };
    } catch (error) {
      console.error('Error getting pair reserves:', error);
      return null;
    }
  }

  /**
   * Cache price data
   */
  private cachePrice(address: string, data: PriceData) {
    this.priceCache.set(address.toLowerCase(), {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get prices for multiple tokens in parallel
   */
  async getMultipleTokenPrices(tokenAddresses: string[]): Promise<Map<string, PriceData | null>> {
    const results = new Map<string, PriceData | null>();
    
    // Process all tokens in parallel with rate limiting
    const BATCH_SIZE = 100; // Massive parallelization for fast processing
    const batches: string[][] = [];
    
    // Create batches
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
    }
    
    // Process all batches in parallel
    const allBatchPromises = batches.map(async (batch) => {
      const batchResults = await Promise.all(
        batch.map(async (address) => {
          const price = await this.getTokenPrice(address);
          return { address: address.toLowerCase(), price };
        })
      );
      
      // Add results to map
      batchResults.forEach(({ address, price }) => {
        results.set(address, price);
      });
    });
    
    // Wait for all batches to complete
    await Promise.all(allBatchPromises);
    
    return results;
  }

  /**
   * Clear cache to force fresh data
   */
  clearCache() {
    this.priceCache.clear();
  }
}

// Export singleton instance
export const smartContractPriceService = new SmartContractPriceService();

// Export function for easy use
export async function getTokenPriceFromContract(tokenAddress: string): Promise<PriceData | null> {
  return smartContractPriceService.getTokenPrice(tokenAddress);
}

// Export function for batch pricing
export async function getMultipleTokenPricesFromContract(tokenAddresses: string[]): Promise<Map<string, PriceData | null>> {
  return smartContractPriceService.getMultipleTokenPrices(tokenAddresses);
}