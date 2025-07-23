/**
 * Request deduplicator to prevent duplicate API calls
 * If multiple components request the same data within a short timeframe,
 * they'll share the same promise instead of making duplicate requests
 */

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private readonly TTL = 1000; // 1 second TTL for deduplication

  /**
   * Execute a request with deduplication
   * @param key Unique key for this request
   * @param requestFn Function that returns a promise
   */
  async deduplicate<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // Check if we have a pending request for this key
    const pending = this.pendingRequests.get(key);
    
    if (pending && Date.now() - pending.timestamp < this.TTL) {
      console.log(`[Deduplicator] Reusing pending request for: ${key}`);
      return pending.promise;
    }

    // Create new request
    console.log(`[Deduplicator] Creating new request for: ${key}`);
    const promise = requestFn().finally(() => {
      // Clean up after request completes
      setTimeout(() => {
        if (this.pendingRequests.get(key)?.timestamp === pending?.timestamp) {
          this.pendingRequests.delete(key);
        }
      }, this.TTL);
    });

    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    return promise;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.pendingRequests.clear();
  }
}

export const requestDeduplicator = new RequestDeduplicator();