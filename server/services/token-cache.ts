/**
 * Lightweight in-memory token cache to speed up repeated wallet lookups
 */

interface TokenCacheEntry {
  tokens: Set<string>;
  timestamp: number;
}

interface TokenMetadataEntry {
  symbol: string;
  name: string;
  decimals: number;
  timestamp: number;
}

export class TokenCache {
  private static instance: TokenCache;
  private walletTokenCache = new Map<string, TokenCacheEntry>();
  private tokenMetadataCache = new Map<string, TokenMetadataEntry>();
  
  // Cache TTL: 5 minutes for wallet tokens, 1 hour for token metadata
  private static readonly WALLET_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly METADATA_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  
  private constructor() {
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }
  
  static getInstance(): TokenCache {
    if (!TokenCache.instance) {
      TokenCache.instance = new TokenCache();
    }
    return TokenCache.instance;
  }
  
  /**
   * Get cached tokens for a wallet
   */
  getWalletTokens(walletAddress: string): Set<string> | null {
    const entry = this.walletTokenCache.get(walletAddress.toLowerCase());
    if (!entry) return null;
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > TokenCache.WALLET_CACHE_TTL) {
      this.walletTokenCache.delete(walletAddress.toLowerCase());
      return null;
    }
    
    return new Set(entry.tokens); // Return a copy to prevent external modifications
  }
  
  /**
   * Cache tokens for a wallet
   */
  setWalletTokens(walletAddress: string, tokens: Set<string>): void {
    this.walletTokenCache.set(walletAddress.toLowerCase(), {
      tokens: new Set(tokens), // Store a copy
      timestamp: Date.now()
    });
  }
  
  /**
   * Get cached token metadata
   */
  getTokenMetadata(tokenAddress: string): TokenMetadataEntry | null {
    const entry = this.tokenMetadataCache.get(tokenAddress.toLowerCase());
    if (!entry) return null;
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > TokenCache.METADATA_CACHE_TTL) {
      this.tokenMetadataCache.delete(tokenAddress.toLowerCase());
      return null;
    }
    
    return entry;
  }
  
  /**
   * Cache token metadata
   */
  setTokenMetadata(tokenAddress: string, metadata: Omit<TokenMetadataEntry, 'timestamp'>): void {
    this.tokenMetadataCache.set(tokenAddress.toLowerCase(), {
      ...metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Clean wallet token cache
    for (const [address, entry] of this.walletTokenCache.entries()) {
      if (now - entry.timestamp > TokenCache.WALLET_CACHE_TTL) {
        this.walletTokenCache.delete(address);
      }
    }
    
    // Clean token metadata cache
    for (const [address, entry] of this.tokenMetadataCache.entries()) {
      if (now - entry.timestamp > TokenCache.METADATA_CACHE_TTL) {
        this.tokenMetadataCache.delete(address);
      }
    }
  }
  
  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearAll(): void {
    this.walletTokenCache.clear();
    this.tokenMetadataCache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { walletCacheSize: number; metadataCacheSize: number } {
    return {
      walletCacheSize: this.walletTokenCache.size,
      metadataCacheSize: this.tokenMetadataCache.size
    };
  }
}

// Export singleton instance
export const tokenCache = TokenCache.getInstance();