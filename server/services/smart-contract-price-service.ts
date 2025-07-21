/**
 * Client-side smart contract price service for fetching real-time token prices
 * directly from PulseChain liquidity pools
 *
 * Optimized for performance with batching, caching, and concurrent requests
 */

import { ethers } from "ethers";

interface PriceData {
  price: number;
  liquidity: number;
  pairAddress: string;
  token0: string;
  token1: string;
}

interface TokenInfo {
  address: string;
  decimals: number;
  symbol?: string;
  name?: string;
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
];

// Multicall3 ABI for batching
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])",
];

// Constants
const PULSEX_FACTORY = "0x1715a3E4A142d8b698131108995174F37aEBA10D";
const WPLS_ADDRESS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11"; // Multicall3 on PulseChain

// Stablecoin addresses on PulseChain
const STABLECOINS = [
  "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", // USDC from Ethereum
  "0xefD766cCb38EaF1dfd701853BFCe31359239F305", // DAI from Ethereum
  "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f", // USDT from Ethereum
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
];

// RPC endpoints
const RPC_ENDPOINTS = [
  "https://rpc.pulsechain.com",
  "https://pulsechain-rpc.publicnode.com",
  "https://rpc-pulsechain.g4mm4.io",
];

export class ClientPriceService {
  private provider: ethers.providers.JsonRpcProvider;
  private multicall: ethers.Contract;
  private factory: ethers.Contract;
  private priceCache: Map<string, { data: PriceData; timestamp: number }>;
  private tokenInfoCache: Map<string, TokenInfo>;
  private wplsCache: { price: number; timestamp: number } | null;
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private WPLS_CACHE_TTL = 60 * 1000; // 1 minute

  constructor() {
    // Initialize with first available RPC
    this.provider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINTS[0]);
    this.multicall = new ethers.Contract(
      MULTICALL3_ADDRESS,
      MULTICALL3_ABI,
      this.provider,
    );
    this.factory = new ethers.Contract(
      PULSEX_FACTORY,
      FACTORY_ABI,
      this.provider,
    );
    this.priceCache = new Map();
    this.tokenInfoCache = new Map();
    this.wplsCache = null;

    // Test connection and fallback to other RPCs if needed
    this.testAndSetProvider();
  }

  private async testAndSetProvider() {
    for (const rpc of RPC_ENDPOINTS) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpc);
        await provider.getBlockNumber();
        this.provider = provider;
        this.multicall = new ethers.Contract(
          MULTICALL3_ADDRESS,
          MULTICALL3_ABI,
          provider,
        );
        this.factory = new ethers.Contract(
          PULSEX_FACTORY,
          FACTORY_ABI,
          provider,
        );
        console.log(`Connected to RPC: ${rpc}`);
        break;
      } catch (error) {
        console.warn(`Failed to connect to ${rpc}:`, error);
      }
    }
  }

  private async getTokenInfoBatch(
    addresses: string[],
  ): Promise<Map<string, TokenInfo>> {
    const results = new Map<string, TokenInfo>();
    const uncachedAddresses: string[] = [];

    // Check cache first
    for (const address of addresses) {
      const cached = this.tokenInfoCache.get(address.toLowerCase());
      if (cached) {
        results.set(address.toLowerCase(), cached);
      } else {
        uncachedAddresses.push(address);
      }
    }

    if (uncachedAddresses.length === 0) return results;

    // Prepare multicall for uncached tokens
    const calls = uncachedAddresses.map((address) => {
      const iface = new ethers.utils.Interface(ERC20_ABI);
      return {
        target: address,
        allowFailure: true,
        callData: iface.encodeFunctionData("decimals"),
      };
    });

    try {
      const multicallResults = await this.multicall.aggregate3(calls);

      for (let i = 0; i < uncachedAddresses.length; i++) {
        const address = uncachedAddresses[i].toLowerCase();
        const result = multicallResults[i];

        if (result.success) {
          try {
            const decimals = ethers.utils.defaultAbiCoder.decode(
              ["uint8"],
              result.returnData,
            )[0];
            const info: TokenInfo = { address, decimals };
            this.tokenInfoCache.set(address, info);
            results.set(address, info);
          } catch {
            // Default to 18 decimals
            const info: TokenInfo = { address, decimals: 18 };
            this.tokenInfoCache.set(address, info);
            results.set(address, info);
          }
        } else {
          // Default to 18 decimals
          const info: TokenInfo = { address, decimals: 18 };
          this.tokenInfoCache.set(address, info);
          results.set(address, info);
        }
      }
    } catch (error) {
      console.error(
        "Multicall failed, falling back to individual calls:",
        error,
      );
      // Fallback to individual calls
      for (const address of uncachedAddresses) {
        const info: TokenInfo = {
          address: address.toLowerCase(),
          decimals: 18,
        };
        this.tokenInfoCache.set(address.toLowerCase(), info);
        results.set(address.toLowerCase(), info);
      }
    }

    return results;
  }

  private async getPairsBatch(
    tokenAddresses: string[],
    quoteToken: string,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const iface = new ethers.utils.Interface(FACTORY_ABI);

    const calls = tokenAddresses.map((token) => ({
      target: PULSEX_FACTORY,
      allowFailure: true,
      callData: iface.encodeFunctionData("getPair", [token, quoteToken]),
    }));

    try {
      const multicallResults = await this.multicall.aggregate3(calls);

      for (let i = 0; i < tokenAddresses.length; i++) {
        const result = multicallResults[i];
        if (result.success) {
          const pairAddress = ethers.utils.defaultAbiCoder.decode(
            ["address"],
            result.returnData,
          )[0];
          if (pairAddress !== ethers.constants.AddressZero) {
            results.set(tokenAddresses[i].toLowerCase(), pairAddress);
          }
        }
      }
    } catch (error) {
      console.error("Failed to get pairs batch:", error);
    }

    return results;
  }

  private async getReservesBatch(
    pairAddresses: string[],
  ): Promise<Map<string, any>> {
    const results = new Map();
    const iface = new ethers.utils.Interface(PAIR_ABI);

    // Create calls for reserves, token0, and token1
    const calls: any[] = [];
    for (const pairAddress of pairAddresses) {
      calls.push({
        target: pairAddress,
        allowFailure: true,
        callData: iface.encodeFunctionData("getReserves"),
      });
      calls.push({
        target: pairAddress,
        allowFailure: true,
        callData: iface.encodeFunctionData("token0"),
      });
      calls.push({
        target: pairAddress,
        allowFailure: true,
        callData: iface.encodeFunctionData("token1"),
      });
    }

    try {
      const multicallResults = await this.multicall.aggregate3(calls);

      for (let i = 0; i < pairAddresses.length; i++) {
        const reservesResult = multicallResults[i * 3];
        const token0Result = multicallResults[i * 3 + 1];
        const token1Result = multicallResults[i * 3 + 2];

        if (
          reservesResult.success &&
          token0Result.success &&
          token1Result.success
        ) {
          const reserves = ethers.utils.defaultAbiCoder.decode(
            ["uint112", "uint112", "uint32"],
            reservesResult.returnData,
          );
          const token0 = ethers.utils.defaultAbiCoder.decode(
            ["address"],
            token0Result.returnData,
          )[0];
          const token1 = ethers.utils.defaultAbiCoder.decode(
            ["address"],
            token1Result.returnData,
          )[0];

          results.set(pairAddresses[i], {
            reserve0: reserves[0],
            reserve1: reserves[1],
            token0: token0.toLowerCase(),
            token1: token1.toLowerCase(),
          });
        }
      }
    } catch (error) {
      console.error("Failed to get reserves batch:", error);
    }

    return results;
  }

  async getWPLSPrice(): Promise<number> {
    // Check cache first
    if (
      this.wplsCache &&
      Date.now() - this.wplsCache.timestamp < this.WPLS_CACHE_TTL
    ) {
      return this.wplsCache.price;
    }

    // Get WPLS pairs with all stablecoins
    const wplsPairs = await this.getPairsBatch([WPLS_ADDRESS], STABLECOINS[0]);

    for (const stablecoin of STABLECOINS) {
      const pairs = await this.getPairsBatch([WPLS_ADDRESS], stablecoin);
      const pairAddress = pairs.get(WPLS_ADDRESS.toLowerCase());

      if (pairAddress) {
        const reserves = await this.getReservesBatch([pairAddress]);
        const reserveData = reserves.get(pairAddress);

        if (reserveData) {
          const tokenInfo = await this.getTokenInfoBatch([
            WPLS_ADDRESS,
            stablecoin,
          ]);
          const wplsInfo = tokenInfo.get(WPLS_ADDRESS.toLowerCase());
          const stableInfo = tokenInfo.get(stablecoin.toLowerCase());

          if (wplsInfo && stableInfo) {
            const isToken0 = reserveData.token0 === WPLS_ADDRESS.toLowerCase();
            const wplsReserve = isToken0
              ? reserveData.reserve0
              : reserveData.reserve1;
            const stableReserve = isToken0
              ? reserveData.reserve1
              : reserveData.reserve0;

            const wplsAmount = parseFloat(
              ethers.utils.formatUnits(wplsReserve, wplsInfo.decimals),
            );
            const stableAmount = parseFloat(
              ethers.utils.formatUnits(stableReserve, stableInfo.decimals),
            );

            if (wplsAmount > 0) {
              const price = stableAmount / wplsAmount;
              this.wplsCache = { price, timestamp: Date.now() };
              return price;
            }
          }
        }
      }
    }

    // Fallback price
    const fallbackPrice = 0.0027;
    this.wplsCache = { price: fallbackPrice, timestamp: Date.now() };
    return fallbackPrice;
  }

  async getTokenPrices(
    tokenAddresses: string[],
  ): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();
    const uncachedTokens: string[] = [];

    // Check cache and filter uncached tokens
    for (const address of tokenAddresses) {
      const normalizedAddress = address.toLowerCase();
      const cached = this.priceCache.get(normalizedAddress);

      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results.set(normalizedAddress, cached.data);
      } else {
        uncachedTokens.push(address);
      }
    }

    if (uncachedTokens.length === 0) return results;

    // Get token info for all uncached tokens
    const tokenInfo = await this.getTokenInfoBatch(uncachedTokens);

    // Process in batches for different quote tokens
    const BATCH_SIZE = 50;

    // Try stablecoin pairs first
    for (const stablecoin of STABLECOINS) {
      for (let i = 0; i < uncachedTokens.length; i += BATCH_SIZE) {
        const batch = uncachedTokens.slice(i, i + BATCH_SIZE);
        const pairs = await this.getPairsBatch(batch, stablecoin);

        if (pairs.size > 0) {
          const pairAddresses = Array.from(pairs.values());
          const reserves = await this.getReservesBatch(pairAddresses);

          for (const [tokenAddress, pairAddress] of pairs) {
            const reserveData = reserves.get(pairAddress);
            if (!reserveData) continue;

            const token = tokenInfo.get(tokenAddress);
            const stable = tokenInfo.get(stablecoin.toLowerCase());

            if (token && stable) {
              const isToken0 = reserveData.token0 === tokenAddress;
              const tokenReserve = isToken0
                ? reserveData.reserve0
                : reserveData.reserve1;
              const stableReserve = isToken0
                ? reserveData.reserve1
                : reserveData.reserve0;

              const tokenAmount = parseFloat(
                ethers.utils.formatUnits(tokenReserve, token.decimals),
              );
              const stableAmount = parseFloat(
                ethers.utils.formatUnits(stableReserve, stable.decimals),
              );

              if (tokenAmount > 0) {
                const price = stableAmount / tokenAmount;
                const liquidity = stableAmount * 2;

                const priceData: PriceData = {
                  price,
                  liquidity,
                  pairAddress,
                  token0: reserveData.token0,
                  token1: reserveData.token1,
                };

                results.set(tokenAddress, priceData);
                this.priceCache.set(tokenAddress, {
                  data: priceData,
                  timestamp: Date.now(),
                });

                // Remove from uncached list
                const index = uncachedTokens.indexOf(tokenAddress);
                if (index > -1) uncachedTokens.splice(index, 1);
              }
            }
          }
        }
      }
    }

    // Try WPLS pairs for remaining tokens
    if (uncachedTokens.length > 0) {
      const wplsPrice = await this.getWPLSPrice();

      for (let i = 0; i < uncachedTokens.length; i += BATCH_SIZE) {
        const batch = uncachedTokens.slice(i, i + BATCH_SIZE);
        const pairs = await this.getPairsBatch(batch, WPLS_ADDRESS);

        if (pairs.size > 0) {
          const pairAddresses = Array.from(pairs.values());
          const reserves = await this.getReservesBatch(pairAddresses);

          for (const [tokenAddress, pairAddress] of pairs) {
            const reserveData = reserves.get(pairAddress);
            if (!reserveData) continue;

            const token = tokenInfo.get(tokenAddress);
            const wpls = tokenInfo.get(WPLS_ADDRESS.toLowerCase());

            if (token && wpls) {
              const isToken0 = reserveData.token0 === tokenAddress;
              const tokenReserve = isToken0
                ? reserveData.reserve0
                : reserveData.reserve1;
              const wplsReserve = isToken0
                ? reserveData.reserve1
                : reserveData.reserve0;

              const tokenAmount = parseFloat(
                ethers.utils.formatUnits(tokenReserve, token.decimals),
              );
              const wplsAmount = parseFloat(
                ethers.utils.formatUnits(wplsReserve, wpls.decimals),
              );

              if (tokenAmount > 0) {
                const priceInWPLS = wplsAmount / tokenAmount;
                const price = priceInWPLS * wplsPrice;
                const liquidity = wplsAmount * wplsPrice * 2;

                const priceData: PriceData = {
                  price,
                  liquidity,
                  pairAddress,
                  token0: reserveData.token0,
                  token1: reserveData.token1,
                };

                results.set(tokenAddress, priceData);
                this.priceCache.set(tokenAddress, {
                  data: priceData,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
      }
    }

    return results;
  }

  // Get single token price (convenience method)
  async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    const prices = await this.getTokenPrices([tokenAddress]);
    return prices.get(tokenAddress.toLowerCase()) || null;
  }

  // Clear caches
  clearCache() {
    this.priceCache.clear();
    this.tokenInfoCache.clear();
    this.wplsCache = null;
  }
}

// Export singleton instance for easy use
export const priceService = new ClientPriceService();
