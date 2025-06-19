/**
 * Rate limiting service for DexScreener API calls
 * Implements token bucket algorithm with exponential backoff
 */

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

class RateLimitService {
  private bucket: RateLimitBucket;
  private isRateLimited: boolean = false;
  private rateLimitUntil: number = 0;

  constructor() {
    // Conservative rate limiting: 30 requests per minute
    this.bucket = {
      tokens: 30,
      lastRefill: Date.now(),
      capacity: 30,
      refillRate: 0.5 // 30 tokens per 60 seconds = 0.5 tokens per second
    };
  }

  /**
   * Check if we can make a request
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    
    // Check if we're in a rate limit cooldown
    if (this.isRateLimited && now < this.rateLimitUntil) {
      return false;
    }
    
    if (this.isRateLimited && now >= this.rateLimitUntil) {
      this.isRateLimited = false;
      console.log('Rate limit cooldown expired, resuming requests');
    }

    this.refillBucket();
    return this.bucket.tokens > 0;
  }

  /**
   * Consume a token for making a request
   */
  consumeToken(): boolean {
    if (!this.canMakeRequest()) {
      return false;
    }
    
    this.bucket.tokens--;
    return true;
  }

  /**
   * Handle rate limit response from API
   */
  handleRateLimit(): void {
    this.isRateLimited = true;
    this.rateLimitUntil = Date.now() + (60 * 1000); // 1 minute cooldown
    this.bucket.tokens = 0;
    console.log('Rate limit detected, entering 1 minute cooldown');
  }

  /**
   * Get estimated wait time until next request can be made
   */
  getWaitTime(): number {
    if (this.isRateLimited) {
      return Math.max(0, this.rateLimitUntil - Date.now());
    }
    
    if (this.bucket.tokens > 0) {
      return 0;
    }
    
    // Time to get 1 token
    return Math.ceil(1000 / this.bucket.refillRate);
  }

  /**
   * Refill the token bucket based on time elapsed
   */
  private refillBucket(): void {
    const now = Date.now();
    const timePassed = (now - this.bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = Math.floor(timePassed * this.bucket.refillRate);
    
    if (tokensToAdd > 0) {
      this.bucket.tokens = Math.min(this.bucket.capacity, this.bucket.tokens + tokensToAdd);
      this.bucket.lastRefill = now;
    }
  }
}

export const rateLimitService = new RateLimitService();