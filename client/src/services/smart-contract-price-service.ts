import { ethers } from 'ethers';

// Multiple RPC endpoints for reliability
const RPC_ENDPOINTS = [
  'https://rpc.pulsechain.com',
  'https://rpc-pulsechain.g4mm4.io',
  'https://pulsechain.publicnode.com'
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
  private CACHE_TTL = 2000; // 2 seconds cache for rapid updates

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize multiple providers for redundancy
    this.providers = RPC_ENDPOINTS.map(url => new ethers.providers.JsonRpcProvider(url));
  }

  private getProvider(): ethers.providers.JsonRpcProvider {
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
    const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);

    // Try each stablecoin
    for (const [stableAddress, stableInfo] of Object.entries(STABLECOINS)) {
      try {
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
      return null; // Can't get WPLS price from WPLS pair
    }

    const provider = this.getProvider();
    const factory = new ethers.Contract(PULSEX_FACTORY, FACTORY_ABI, provider);

    try {
      const pairAddress = await factory.getPair(tokenAddress, WPLS_ADDRESS);
      if (pairAddress === ethers.constants.AddressZero) return null;

      const reserves = await this.getPairReserves(pairAddress, tokenAddress, WPLS_ADDRESS);
      if (!reserves) return null;

      // Calculate price in WPLS
      const isToken0 = reserves.token0Address.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
      const wplsReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;
      const tokenDecimals = isToken0 ? reserves.decimals0 : reserves.decimals1;
      const wplsDecimals = isToken0 ? reserves.decimals1 : reserves.decimals0;

      const priceInWPLS = Number(wplsReserve) / Number(tokenReserve) * 
                          Math.pow(10, tokenDecimals - wplsDecimals);

      // Calculate liquidity in WPLS
      const wplsLiquidity = Number(wplsReserve) / Math.pow(10, wplsDecimals);

      return {
        price: priceInWPLS, // Will be converted to USD by caller
        pairAddress,
        pairedTokenSymbol: 'WPLS',
        liquidity: wplsLiquidity * 2,
        lastUpdate: Date.now()
      };
    } catch (error) {
      console.error('Error getting WPLS pair price:', error);
      return null;
    }
  }

  /**
   * Get WPLS price in USD from stablecoin pairs
   */
  private async getWPLSPrice(): Promise<number | null> {
    const wplsPriceData = await this.getStablecoinPairPrice(WPLS_ADDRESS);
    return wplsPriceData ? wplsPriceData.price : null;
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
    
    // Process in batches to avoid overwhelming the RPC
    const BATCH_SIZE = 10;
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (address) => {
        const price = await this.getTokenPrice(address);
        results.set(address.toLowerCase(), price);
      });
      
      await Promise.all(batchPromises);
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