import { ethers } from 'ethers';

// RPC endpoints optimized for mobile - using the most reliable endpoints
const RPC_ENDPOINTS = [
  'https://rpc.pulsechain.com', // Official endpoint first for mobile reliability
  'https://rpc-pulsechain.g4mm4.io', // g4mm4 as backup
  'https://pulsechain.publicnode.com' // Public node as last resort
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

// Known addresses
const PULSEX_FACTORY = '0x29eA7545DEf87022BAdc76323F373EA1e707C523';
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
  private CACHE_TTL = 5000; // Increased cache time for mobile
  private REQUEST_TIMEOUT = 8000; // 8 second timeout for mobile
  private MAX_RETRIES = 2; // Reduced retries for mobile

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    this.providers = RPC_ENDPOINTS.map((url, index) => {
      const provider = new ethers.providers.JsonRpcProvider({
        url,
        timeout: this.REQUEST_TIMEOUT,
        throttleLimit: 1, // Limit concurrent requests on mobile
      }, {
        chainId: 369,
        name: 'pulsechain'
      });
      
      // Longer polling interval for mobile to reduce battery usage
      provider.pollingInterval = 8000;
      
      // Add error handling for connection issues
      provider.on('error', (error) => {
        console.warn(`Provider ${index} error:`, error.message);
      });
      
      return provider;
    });
  }

  private getProvider(): ethers.providers.JsonRpcProvider {
    const provider = this.providers[this.currentProviderIndex];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    return provider;
  }

  /**
   * Retry function with exponential backoff for mobile networks
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), this.REQUEST_TIMEOUT)
          )
        ]);
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        // Don't retry on certain errors
        if (error.message?.includes('call revert') || 
            error.message?.includes('invalid address') ||
            error.message?.includes('could not detect network') || // Fail fast on network detection errors
            isLastAttempt) {
          if (isLastAttempt || error.message?.includes('could not detect network')) {
            console.warn(`Operation failed after ${attempt + 1} attempts:`, error.message);
          }
          return null;
        }
        
        // Exponential backoff with jitter for mobile networks
        const backoffTime = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 5000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        
        // Try next provider on network errors
        if (error.message?.includes('network') || error.message?.includes('timeout')) {
          this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        }
      }
    }
    return null;
  }

  /**
   * Get real-time price for a token by reading directly from smart contracts
   */
  async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    if (!tokenAddress || typeof tokenAddress !== 'string') {
      console.error('Invalid token address provided');
      return null;
    }

    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache first
    const cached = this.priceCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
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
    } catch (error: any) {
      console.error('Error fetching token price:', error.message || error);
      return null;
    }
  }

  /**
   * Get price from stablecoin pairs
   */
  private async getStablecoinPairPrice(tokenAddress: string): Promise<PriceData | null> {
    // Try each stablecoin sequentially to reduce network load
    for (const [stableAddress, stableInfo] of Object.entries(STABLECOINS)) {
      try {
        const result = await this.retryWithBackoff(async () => {
          const provider = this.getProvider();
          const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);
          
          const pairAddress = await factory.getPair(tokenAddress, stableAddress);
          if (!pairAddress || pairAddress === ethers.constants.AddressZero) {
            return null;
          }

          const reserves = await this.getPairReserves(pairAddress, tokenAddress, stableAddress);
          if (!reserves) return null;

          // Calculate price
          const isToken0 = reserves.token0Address.toLowerCase() === tokenAddress.toLowerCase();
          const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
          const stableReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
          const tokenDecimals = isToken0 ? reserves.decimals0 : reserves.decimals1;
          const stableDecimals = isToken0 ? reserves.decimals1 : reserves.decimals0;

          // Ensure reserves are not zero
          if (tokenReserve === 0n || stableReserve === 0n) {
            return null;
          }

          // Calculate price with safer arithmetic
          const price = Number(stableReserve) / Number(tokenReserve) * 
                       Math.pow(10, tokenDecimals - stableDecimals);

          // Validate price is reasonable
          if (!isFinite(price) || price <= 0) {
            return null;
          }

          // Calculate liquidity
          const stableLiquidity = Number(stableReserve) / Math.pow(10, stableDecimals);
          const liquidity = stableLiquidity * 2;

          return {
            price,
            pairAddress,
            pairedTokenSymbol: stableInfo.name,
            liquidity,
            lastUpdate: Date.now()
          };
        });

        if (result) {
          return result;
        }
      } catch (error) {
        // Continue to next stablecoin
        continue;
      }
    }

    return null;
  }

  /**
   * Get price from WPLS pair
   */
  private async getWPLSPairPrice(tokenAddress: string): Promise<PriceData | null> {
    if (tokenAddress.toLowerCase() === WPLS_ADDRESS.toLowerCase()) {
      return null;
    }

    return this.retryWithBackoff(async () => {
      const provider = this.getProvider();
      const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);

      const pairAddress = await factory.getPair(tokenAddress, WPLS_ADDRESS);
      if (!pairAddress || pairAddress === ethers.constants.AddressZero) {
        return null;
      }

      const reserves = await this.getPairReserves(pairAddress, tokenAddress, WPLS_ADDRESS);
      if (!reserves) return null;

      // Calculate price in WPLS
      const isToken0 = reserves.token0Address.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
      const wplsReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
      const tokenDecimals = isToken0 ? reserves.decimals0 : reserves.decimals1;
      const wplsDecimals = isToken0 ? reserves.decimals1 : reserves.decimals0;

      if (tokenReserve === 0n || wplsReserve === 0n) {
        return null;
      }

      const priceInWPLS = Number(wplsReserve) / Number(tokenReserve) * 
                          Math.pow(10, tokenDecimals - wplsDecimals);

      if (!isFinite(priceInWPLS) || priceInWPLS <= 0) {
        return null;
      }

      // Calculate liquidity in WPLS
      const wplsLiquidity = Number(wplsReserve) / Math.pow(10, wplsDecimals);

      return {
        price: priceInWPLS,
        pairAddress,
        pairedTokenSymbol: 'WPLS',
        liquidity: wplsLiquidity * 2,
        lastUpdate: Date.now()
      };
    });
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
    return this.retryWithBackoff(async () => {
      const provider = this.getProvider();
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);

      // Get pair tokens and reserves in parallel
      const [pairToken0, pairToken1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
      ]);

      // Get decimals for both tokens
      const token0Contract = new ethers.Contract(pairToken0, ERC20_ABI, provider);
      const token1Contract = new ethers.Contract(pairToken1, ERC20_ABI, provider);
      
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
    });
  }

  /**
   * Cache price data
   */
  private cachePrice(address: string, data: PriceData) {
    this.priceCache.set(address.toLowerCase(), {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size on mobile devices
    if (this.priceCache.size > 1000) {
      const oldestKey = this.priceCache.keys().next().value;
      this.priceCache.delete(oldestKey);
    }
  }

  /**
   * Get prices for multiple tokens in parallel
   */
  async getMultipleTokenPrices(tokenAddresses: string[]): Promise<Map<string, PriceData | null>> {
    const results = new Map<string, PriceData | null>();
    
    // Mobile-optimized batch processing
    const BATCH_SIZE = 10; // Smaller batches for mobile stability
    const batches: string[][] = [];
    
    // Create smaller batches
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      batches.push(tokenAddresses.slice(i, i + BATCH_SIZE));
    }
    
    // Process batches sequentially with delays for mobile network stability
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (address) => {
          try {
            const price = await this.getTokenPrice(address);
            return { address: address.toLowerCase(), price };
          } catch (error) {
            console.warn(`Failed to get price for ${address}:`, error);
            return { address: address.toLowerCase(), price: null };
          }
        })
      );
      
      // Add results to map
      batchResults.forEach(({ address, price }) => {
        results.set(address, price);
      });
      
      // Small delay between batches for mobile network stability
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
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