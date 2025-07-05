import { ethers } from 'ethers';

// RPC endpoints in order of preference (g4mm4 first, then official)
const RPC_ENDPOINTS = [
  'https://rpc-pulsechain.g4mm4.io',
  'https://rpc.pulsechain.com',
  'wss://rpc-pulsechain.g4mm4.io',
  'wss://rpc.pulsechain.com'
];

// WebSocket endpoints for real-time data
const WS_ENDPOINTS = [
  'wss://rpc-pulsechain.g4mm4.io',
  'wss://rpc.pulsechain.com'
];

class RpcProviderManager {
  private httpProviders: ethers.providers.JsonRpcProvider[] = [];
  private wsProviders: ethers.providers.WebSocketProvider[] = [];
  private currentHttpIndex = 0;
  private currentWsIndex = 0;
  private failedProviders = new Set<string>();
  
  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize HTTP providers
    this.httpProviders = RPC_ENDPOINTS
      .filter(endpoint => endpoint.startsWith('https://'))
      .map(endpoint => new ethers.providers.JsonRpcProvider(endpoint));

    // Initialize WebSocket providers
    this.wsProviders = WS_ENDPOINTS
      .map(endpoint => new ethers.providers.WebSocketProvider(endpoint));

    console.log(`Initialized ${this.httpProviders.length} HTTP providers and ${this.wsProviders.length} WebSocket providers`);
  }

  /**
   * Get the current primary HTTP provider
   */
  getHttpProvider(): ethers.providers.JsonRpcProvider {
    return this.httpProviders[this.currentHttpIndex];
  }

  /**
   * Get the current primary WebSocket provider
   */
  getWsProvider(): ethers.providers.WebSocketProvider {
    return this.wsProviders[this.currentWsIndex];
  }

  /**
   * Execute a function with automatic failover
   */
  async executeWithFailover<T>(
    fn: (provider: ethers.providers.JsonRpcProvider) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < maxRetries && attempts < this.httpProviders.length) {
      const provider = this.httpProviders[this.currentHttpIndex];
      const endpoint = RPC_ENDPOINTS[this.currentHttpIndex];

      try {
        const result = await Promise.race([
          fn(provider),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('RPC call timeout')), 10000)
          )
        ]);

        // Success - reset failed providers if this was previously failed
        if (this.failedProviders.has(endpoint)) {
          this.failedProviders.delete(endpoint);
          console.log(`RPC provider ${endpoint} recovered`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        
        console.warn(`RPC provider ${endpoint} failed (attempt ${attempts}/${maxRetries}):`, error);
        
        // Mark as failed
        this.failedProviders.add(endpoint);
        
        // Switch to next provider
        this.switchToNextProvider();
      }
    }

    throw new Error(`All RPC providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Switch to the next available provider
   */
  private switchToNextProvider() {
    this.currentHttpIndex = (this.currentHttpIndex + 1) % this.httpProviders.length;
    this.currentWsIndex = (this.currentWsIndex + 1) % this.wsProviders.length;
    
    const newEndpoint = RPC_ENDPOINTS[this.currentHttpIndex];
    console.log(`Switched to RPC provider: ${newEndpoint}`);
  }

  /**
   * Get health status of all providers
   */
  async getProviderHealth(): Promise<{
    primary: string;
    healthy: string[];
    failed: string[];
    totalProviders: number;
  }> {
    const healthChecks = await Promise.allSettled(
      this.httpProviders.map(async (provider, index) => {
        const endpoint = RPC_ENDPOINTS.filter(e => e.startsWith('https://'))[index];
        try {
          await provider.getBlockNumber();
          return { endpoint, healthy: true };
        } catch (error) {
          return { endpoint, healthy: false };
        }
      })
    );

    const results = healthChecks.map(result => 
      result.status === 'fulfilled' ? result.value : { endpoint: 'unknown', healthy: false }
    );

    return {
      primary: RPC_ENDPOINTS[this.currentHttpIndex],
      healthy: results.filter(r => r.healthy).map(r => r.endpoint),
      failed: results.filter(r => !r.healthy).map(r => r.endpoint),
      totalProviders: this.httpProviders.length
    };
  }

  /**
   * Force switch to a specific provider by index
   */
  switchToProvider(index: number) {
    if (index >= 0 && index < this.httpProviders.length) {
      this.currentHttpIndex = index;
      this.currentWsIndex = Math.min(index, this.wsProviders.length - 1);
      console.log(`Manually switched to provider: ${RPC_ENDPOINTS[index]}`);
    }
  }

  /**
   * Reset all failed providers (useful for recovery)
   */
  resetFailedProviders() {
    this.failedProviders.clear();
    console.log('Reset all failed providers');
  }
}

// Export singleton instance
export const rpcManager = new RpcProviderManager();

// Export convenience functions
export const getProvider = () => rpcManager.getHttpProvider();
export const getWsProvider = () => rpcManager.getWsProvider();
export const executeWithFailover = <T>(fn: (provider: ethers.providers.JsonRpcProvider) => Promise<T>) =>
  rpcManager.executeWithFailover(fn);

// Export for health monitoring
export const getProviderHealth = () => rpcManager.getProviderHealth();
export const switchToProvider = (index: number) => rpcManager.switchToProvider(index);
export const resetFailedProviders = () => rpcManager.resetFailedProviders();