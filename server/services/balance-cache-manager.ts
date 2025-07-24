/**
 * Balance Cache Manager
 * Manages local balance cache with WebSocket event updates
 * Provides reconciliation with blockchain data
 */

import { EventEmitter } from 'events';
import { ProcessedToken } from '../types';
import { liveBalanceTracker, TransferEvent, BalanceUpdate } from './live-balance-tracker';
import { getScannerTokenBalances } from './scanner-balance-service';
import { getTokenPriceDataFromDexScreener } from './dexscreener';

interface TokenCache {
  balance: string;
  formattedBalance: number;
  decimals?: number;
  lastUpdatedBlock: number;
  lastUpdatedTimestamp: number;
}

interface WalletCache {
  [tokenAddress: string]: TokenCache;
}

interface BalanceCache {
  [walletAddress: string]: WalletCache;
}

interface PendingUpdate {
  wallet: string;
  token: string;
  promise: Promise<void>;
}

class BalanceCacheManager extends EventEmitter {
  private cache: BalanceCache = {};
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private reconciliationInterval: NodeJS.Timeout | null = null;
  private reconciliationIntervalMs = 5 * 60 * 1000; // 5 minutes
  private tokenMetadata: Map<string, { symbol: string; name: string; decimals: number }> = new Map();
  
  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen to balance updates from WebSocket tracker
    liveBalanceTracker.on('balanceUpdate', (update: BalanceUpdate) => {
      this.handleBalanceUpdate(update);
    });
    
    // Listen to transfer events for immediate updates
    liveBalanceTracker.on('transfer', async (event: TransferEvent) => {
      console.log(`Transfer event received for ${event.wallet}/${event.token}: ${event.direction}`);
      // Balance update will follow automatically from the tracker
    });
    
    liveBalanceTracker.on('connected', () => {
      console.log('WebSocket connected, balance tracking active');
    });
    
    liveBalanceTracker.on('disconnected', () => {
      console.log('WebSocket disconnected, relying on cached data');
    });
  }

  private async handleBalanceUpdate(update: BalanceUpdate) {
    const key = `${update.wallet}-${update.token}`;
    
    // Prevent race conditions
    if (this.pendingUpdates.has(key)) {
      const pending = this.pendingUpdates.get(key)!;
      await pending.promise;
    }
    
    const updatePromise = this.processBalanceUpdate(update);
    this.pendingUpdates.set(key, {
      wallet: update.wallet,
      token: update.token,
      promise: updatePromise
    });
    
    try {
      await updatePromise;
    } finally {
      this.pendingUpdates.delete(key);
    }
  }

  private async processBalanceUpdate(update: BalanceUpdate) {
    const walletKey = update.wallet.toLowerCase();
    const tokenKey = update.token.toLowerCase();
    
    if (!this.cache[walletKey]) {
      this.cache[walletKey] = {};
    }
    
    this.cache[walletKey][tokenKey] = {
      balance: update.balance,
      formattedBalance: update.formattedBalance,
      lastUpdatedBlock: update.blockNumber,
      lastUpdatedTimestamp: update.timestamp
    };
    
    console.log(`Balance updated for ${walletKey}/${tokenKey}: ${update.formattedBalance}`);
    
    // Emit update event for UI
    this.emit('balanceUpdated', {
      wallet: walletKey,
      token: tokenKey,
      balance: update.balance,
      formattedBalance: update.formattedBalance
    });
  }

  async trackWallet(walletAddress: string, tokens: ProcessedToken[]) {
    const normalizedWallet = walletAddress.toLowerCase();
    
    // Extract token addresses
    const tokenAddresses = tokens
      .filter(t => !t.isNative) // Skip native PLS
      .map(t => t.address.toLowerCase());
    
    // Store token metadata for later use
    tokens.forEach(token => {
      if (!token.isNative) {
        this.tokenMetadata.set(token.address.toLowerCase(), {
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals
        });
      }
    });
    
    // Initialize cache with current balances
    if (!this.cache[normalizedWallet]) {
      this.cache[normalizedWallet] = {};
    }
    
    tokens.forEach(token => {
      if (!token.isNative) {
        this.cache[normalizedWallet][token.address.toLowerCase()] = {
          balance: token.balance,
          formattedBalance: token.balanceFormatted,
          decimals: token.decimals,
          lastUpdatedBlock: 0,
          lastUpdatedTimestamp: Date.now()
        };
      }
    });
    
    // Start WebSocket tracking if ready
    if (liveBalanceTracker.isReady()) {
      await liveBalanceTracker.trackWallet(walletAddress, tokenAddresses);
    }
    
    // Start reconciliation if not already running
    if (!this.reconciliationInterval) {
      this.startReconciliation();
    }
  }

  async untrackWallet(walletAddress: string) {
    const normalizedWallet = walletAddress.toLowerCase();
    
    // Stop WebSocket tracking
    await liveBalanceTracker.untrackWallet(walletAddress);
    
    // Remove from cache
    delete this.cache[normalizedWallet];
    
    // Stop reconciliation if no wallets tracked
    if (Object.keys(this.cache).length === 0 && this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
  }

  getCachedBalances(walletAddress: string): ProcessedToken[] | null {
    const normalizedWallet = walletAddress.toLowerCase();
    const walletCache = this.cache[normalizedWallet];
    
    if (!walletCache) {
      return null;
    }
    
    const tokens: ProcessedToken[] = [];
    
    for (const [tokenAddress, tokenCache] of Object.entries(walletCache)) {
      const metadata = this.tokenMetadata.get(tokenAddress);
      if (!metadata) continue;
      
      tokens.push({
        address: tokenAddress,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        balance: tokenCache.balance,
        balanceFormatted: tokenCache.formattedBalance,
        value: 0, // Will be updated with price data
        logo: undefined,
        isLp: false,
        isNative: false
      });
    }
    
    return tokens;
  }

  private startReconciliation() {
    console.log('Starting balance reconciliation process');
    
    this.reconciliationInterval = setInterval(() => {
      this.reconcileBalances().catch(error => {
        console.error('Reconciliation error:', error);
      });
    }, this.reconciliationIntervalMs);
    
    // Run immediately
    this.reconcileBalances().catch(error => {
      console.error('Initial reconciliation error:', error);
    });
  }

  private async reconcileBalances() {
    console.log('Running balance reconciliation...');
    const startTime = Date.now();
    let mismatches = 0;
    
    for (const [wallet, tokens] of Object.entries(this.cache)) {
      try {
        // Fetch actual balances from scanner
        const actualTokens = await getScannerTokenBalances(wallet);
        
        // Create a map for easy lookup
        const actualBalanceMap = new Map<string, ProcessedToken>();
        actualTokens.forEach(token => {
          if (!token.isNative) {
            actualBalanceMap.set(token.address.toLowerCase(), token);
          }
        });
        
        // Check each cached token
        for (const [tokenAddress, cachedData] of Object.entries(tokens)) {
          const actualToken = actualBalanceMap.get(tokenAddress);
          
          if (!actualToken) {
            console.warn(`Token ${tokenAddress} not found in actual balances for ${wallet}`);
            continue;
          }
          
          // Compare balances
          if (actualToken.balance !== cachedData.balance) {
            mismatches++;
            console.warn(`Balance mismatch for ${wallet}/${tokenAddress}:`, {
              cached: cachedData.balance,
              actual: actualToken.balance,
              cachedFormatted: cachedData.formattedBalance,
              actualFormatted: actualToken.balanceFormatted
            });
            
            // Update cache with correct balance
            cachedData.balance = actualToken.balance;
            cachedData.formattedBalance = actualToken.balanceFormatted;
            cachedData.lastUpdatedTimestamp = Date.now();
            
            // Emit update
            this.emit('balanceUpdated', {
              wallet,
              token: tokenAddress,
              balance: actualToken.balance,
              formattedBalance: actualToken.balanceFormatted,
              source: 'reconciliation'
            });
          }
        }
        
        // Check for new tokens
        actualBalanceMap.forEach((actualToken, tokenAddress) => {
          if (!tokens[tokenAddress]) {
            console.log(`New token found during reconciliation: ${tokenAddress} for ${wallet}`);
            
            // Add to cache
            tokens[tokenAddress] = {
              balance: actualToken.balance,
              formattedBalance: actualToken.balanceFormatted,
              decimals: actualToken.decimals,
              lastUpdatedBlock: 0,
              lastUpdatedTimestamp: Date.now()
            };
            
            // Store metadata
            this.tokenMetadata.set(tokenAddress, {
              symbol: actualToken.symbol,
              name: actualToken.name,
              decimals: actualToken.decimals
            });
            
            // Start tracking if WebSocket is ready
            if (liveBalanceTracker.isReady()) {
              liveBalanceTracker.trackWallet(wallet, [tokenAddress]).catch(error => {
                console.error(`Failed to track new token ${tokenAddress}:`, error);
              });
            }
          }
        });
        
      } catch (error) {
        console.error(`Failed to reconcile balances for ${wallet}:`, error);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`Reconciliation completed in ${duration}ms, found ${mismatches} mismatches`);
  }

  async getBalancesWithLiveUpdates(walletAddress: string): Promise<ProcessedToken[]> {
    const normalizedWallet = walletAddress.toLowerCase();
    
    // Check if we have cached data
    const cachedTokens = this.getCachedBalances(walletAddress);
    if (cachedTokens && cachedTokens.length > 0) {
      console.log(`Returning ${cachedTokens.length} cached tokens for ${walletAddress}`);
      
      // Fetch prices for cached tokens
      await this.updateTokenPrices(cachedTokens);
      
      return cachedTokens;
    }
    
    // No cache, fetch from scanner
    console.log(`No cache found for ${walletAddress}, fetching from scanner`);
    const tokens = await getScannerTokenBalances(walletAddress);
    
    // Start tracking this wallet
    await this.trackWallet(walletAddress, tokens);
    
    return tokens;
  }

  private async updateTokenPrices(tokens: ProcessedToken[]) {
    // Fetch prices in parallel
    const pricePromises = tokens.map(async (token) => {
      if (token.isNative) return;
      
      try {
        const priceData = await getTokenPriceDataFromDexScreener(token.address);
        if (priceData && priceData.price) {
          token.price = priceData.price;
          token.value = token.balanceFormatted * priceData.price;
          token.priceChange24h = priceData.priceChange24h;
          if (priceData.logo) {
            token.logo = priceData.logo;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch price for ${token.symbol}:`, error);
      }
    });
    
    await Promise.all(pricePromises);
  }

  getStatus() {
    const trackedWallets = Object.keys(this.cache).length;
    const totalTokens = Object.values(this.cache).reduce(
      (sum, wallet) => sum + Object.keys(wallet).length, 
      0
    );
    
    return {
      isWebSocketConnected: liveBalanceTracker.isReady(),
      trackedWallets,
      totalTokens,
      cacheSize: JSON.stringify(this.cache).length,
      isReconciling: this.reconciliationInterval !== null
    };
  }

  async close() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
    
    await liveBalanceTracker.close();
    this.cache = {};
    this.tokenMetadata.clear();
  }
}

// Create singleton instance
export const balanceCacheManager = new BalanceCacheManager();

export default balanceCacheManager;