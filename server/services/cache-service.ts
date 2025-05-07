import { WalletData } from '../types';

// Cache interface
interface CacheItem<T> {
  data: T;
  expiry: number; // Timestamp when the cache item expires
}

// Cache configuration
interface CacheConfig {
  walletDataTTL: number; // Time to live in milliseconds for wallet data
  transactionsTTL: number; // Time to live in milliseconds for transaction data
  tokenPriceTTL: number; // Time to live in milliseconds for token price data
}

/**
 * Simple in-memory cache service to reduce API calls
 */
class CacheService {
  private walletDataCache: Map<string, CacheItem<WalletData>> = new Map();
  private transactionsCache: Map<string, CacheItem<any>> = new Map();
  private tokenPriceCache: Map<string, CacheItem<any>> = new Map();
  private config: CacheConfig;

  constructor() {
    // Default cache configuration
    this.config = {
      walletDataTTL: 3 * 60 * 1000, // 3 minutes for wallet data
      transactionsTTL: 10 * 60 * 1000, // 10 minutes for transaction data
      tokenPriceTTL: 5 * 60 * 1000 // 5 minutes for token prices
    };

    // Log cache initialization
    console.log("Cache service initialized with config:", this.config);
    
    // Setup periodic cleanup
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000); // Clean up every 5 minutes
  }

  /**
   * Set wallet data in cache
   */
  setWalletData(walletAddress: string, data: WalletData): void {
    const normalizedAddress = walletAddress.toLowerCase();
    this.walletDataCache.set(normalizedAddress, {
      data,
      expiry: Date.now() + this.config.walletDataTTL
    });
    console.log(`Cached wallet data for ${normalizedAddress}, expires in ${this.config.walletDataTTL / 1000}s`);
  }

  /**
   * Get wallet data from cache if available and not expired
   */
  getWalletData(walletAddress: string): WalletData | null {
    const normalizedAddress = walletAddress.toLowerCase();
    const cached = this.walletDataCache.get(normalizedAddress);
    
    if (cached && Date.now() < cached.expiry) {
      console.log(`Cache hit for wallet data: ${normalizedAddress}`);
      return cached.data;
    }
    
    if (cached) {
      console.log(`Cache expired for wallet data: ${normalizedAddress}`);
      this.walletDataCache.delete(normalizedAddress);
    } else {
      console.log(`Cache miss for wallet data: ${normalizedAddress}`);
    }
    
    return null;
  }

  /**
   * Set transaction data in cache
   */
  setTransactionData(walletAddress: string, limit: number, cursor: string | null, data: any): void {
    const cacheKey = this.getTransactionCacheKey(walletAddress, limit, cursor);
    this.transactionsCache.set(cacheKey, {
      data,
      expiry: Date.now() + this.config.transactionsTTL
    });
    console.log(`Cached transaction data for ${cacheKey}, expires in ${this.config.transactionsTTL / 1000}s`);
  }

  /**
   * Get transaction data from cache if available and not expired
   */
  getTransactionData(walletAddress: string, limit: number, cursor: string | null): any | null {
    const cacheKey = this.getTransactionCacheKey(walletAddress, limit, cursor);
    const cached = this.transactionsCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiry) {
      console.log(`Cache hit for transaction data: ${cacheKey}`);
      return cached.data;
    }
    
    if (cached) {
      console.log(`Cache expired for transaction data: ${cacheKey}`);
      this.transactionsCache.delete(cacheKey);
    } else {
      console.log(`Cache miss for transaction data: ${cacheKey}`);
    }
    
    return null;
  }

  /**
   * Set token price data in cache
   */
  setTokenPrice(tokenAddress: string, data: any): void {
    const normalizedAddress = tokenAddress.toLowerCase();
    this.tokenPriceCache.set(normalizedAddress, {
      data,
      expiry: Date.now() + this.config.tokenPriceTTL
    });
    console.log(`Cached token price for ${normalizedAddress}, expires in ${this.config.tokenPriceTTL / 1000}s`);
  }

  /**
   * Get token price from cache if available and not expired
   */
  getTokenPrice(tokenAddress: string): any | null {
    const normalizedAddress = tokenAddress.toLowerCase();
    const cached = this.tokenPriceCache.get(normalizedAddress);
    
    if (cached && Date.now() < cached.expiry) {
      console.log(`Cache hit for token price: ${normalizedAddress}`);
      return cached.data;
    }
    
    if (cached) {
      console.log(`Cache expired for token price: ${normalizedAddress}`);
      this.tokenPriceCache.delete(normalizedAddress);
    } else {
      console.log(`Cache miss for token price: ${normalizedAddress}`);
    }
    
    return null;
  }

  /**
   * Clear all caches or a specific cache type
   */
  clearCache(type?: 'wallet' | 'transaction' | 'price'): void {
    if (!type || type === 'wallet') {
      this.walletDataCache.clear();
      console.log('Wallet data cache cleared');
    }
    
    if (!type || type === 'transaction') {
      this.transactionsCache.clear();
      console.log('Transaction data cache cleared');
    }
    
    if (!type || type === 'price') {
      this.tokenPriceCache.clear();
      console.log('Token price cache cleared');
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log("Cache config updated:", this.config);
  }

  /**
   * Cleanup expired cache entries to prevent memory leaks
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let walletExpiredCount = 0;
    let transactionExpiredCount = 0;
    let priceExpiredCount = 0;
    
    // Cleanup wallet data cache
    this.walletDataCache.forEach((value, key) => {
      if (now > value.expiry) {
        this.walletDataCache.delete(key);
        walletExpiredCount++;
      }
    });
    
    // Cleanup transactions cache
    this.transactionsCache.forEach((value, key) => {
      if (now > value.expiry) {
        this.transactionsCache.delete(key);
        transactionExpiredCount++;
      }
    });
    
    // Cleanup token price cache
    this.tokenPriceCache.forEach((value, key) => {
      if (now > value.expiry) {
        this.tokenPriceCache.delete(key);
        priceExpiredCount++;
      }
    });
    
    console.log(`Cache cleanup completed: removed ${walletExpiredCount} wallet, ${transactionExpiredCount} transaction, and ${priceExpiredCount} price items`);
  }

  /**
   * Generate a unique cache key for transaction data
   */
  private getTransactionCacheKey(walletAddress: string, limit: number, cursor: string | null): string {
    return `${walletAddress.toLowerCase()}_${limit}_${cursor || 'null'}`;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): any {
    return {
      walletDataCacheSize: this.walletDataCache.size,
      transactionsCacheSize: this.transactionsCache.size,
      tokenPriceCacheSize: this.tokenPriceCache.size,
      config: this.config
    };
  }
}

// Export a singleton instance
export const cacheService = new CacheService();