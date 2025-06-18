/**
 * Background batch fetching service for missing token prices
 * This service handles the client-side polling for background price updates
 */

export interface BackgroundBatchProgress {
  isActive: boolean;
  totalTokens: number;
  completedTokens: number;
  lastUpdate: number;
}

class BackgroundBatchService {
  private activePolls = new Map<string, NodeJS.Timeout>();
  private progressCallbacks = new Map<string, (progress: BackgroundBatchProgress) => void>();

  /**
   * Start background batch fetching for a wallet
   */
  startBackgroundBatch(
    walletAddress: string, 
    missingTokenCount: number,
    onProgress: (progress: BackgroundBatchProgress) => void
  ) {
    // Clear any existing poll for this wallet
    this.stopBackgroundBatch(walletAddress);
    
    console.log(`Starting background batch for ${walletAddress} with ${missingTokenCount} missing prices`);
    
    // Store the progress callback
    this.progressCallbacks.set(walletAddress, onProgress);
    
    // Initial progress update
    onProgress({
      isActive: true,
      totalTokens: missingTokenCount,
      completedTokens: 0,
      lastUpdate: Date.now()
    });
    
    // Poll every 5 seconds for up to 2 minutes
    let pollCount = 0;
    const maxPolls = 24; // 2 minutes / 5 seconds
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        // Check if wallet data has been updated with new prices
        const response = await fetch(`/api/wallet/${walletAddress}/all`);
        
        if (response.ok) {
          const walletData = await response.json();
          const tokensWithPrices = walletData.tokens?.filter((token: any) => token.price > 0).length || 0;
          const totalTokens = walletData.tokens?.length || 0;
          
          // Update progress
          onProgress({
            isActive: true,
            totalTokens: missingTokenCount,
            completedTokens: Math.min(tokensWithPrices, missingTokenCount),
            lastUpdate: Date.now()
          });
          
          // Check if we're done or reached max polls
          if (tokensWithPrices >= totalTokens || pollCount >= maxPolls) {
            this.stopBackgroundBatch(walletAddress);
            
            // Final progress update
            onProgress({
              isActive: false,
              totalTokens: missingTokenCount,
              completedTokens: tokensWithPrices,
              lastUpdate: Date.now()
            });
            
            console.log(`Background batch completed for ${walletAddress}: ${tokensWithPrices}/${totalTokens} tokens have prices`);
          }
        }
      } catch (error) {
        console.error('Error polling for background batch progress:', error);
      }
    }, 5000);
    
    this.activePolls.set(walletAddress, pollInterval);
  }
  
  /**
   * Stop background batch fetching for a wallet
   */
  stopBackgroundBatch(walletAddress: string) {
    const existingPoll = this.activePolls.get(walletAddress);
    if (existingPoll) {
      clearInterval(existingPoll);
      this.activePolls.delete(walletAddress);
      this.progressCallbacks.delete(walletAddress);
      console.log(`Stopped background batch polling for ${walletAddress}`);
    }
  }
  
  /**
   * Check if background batch is active for a wallet
   */
  isActive(walletAddress: string): boolean {
    return this.activePolls.has(walletAddress);
  }
  
  /**
   * Stop all active background batches
   */
  stopAll() {
    const activeWallets = Array.from(this.activePolls.keys());
    for (const walletAddress of activeWallets) {
      this.stopBackgroundBatch(walletAddress);
    }
  }
}

export const backgroundBatchService = new BackgroundBatchService();