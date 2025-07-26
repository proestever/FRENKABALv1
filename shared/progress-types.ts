// Types for real-time progress updates
export interface ProgressUpdate {
  type: 'wallet_fetch' | 'price_check' | 'liquidity_check' | 'batch_progress' | 'error';
  message: string;
  timestamp: number;
  metadata?: {
    walletAddress?: string;
    tokenAddress?: string;
    currentBatch?: number;
    totalBatches?: number;
    walletsProcessed?: number;
    totalWallets?: number;
    liquidityAmount?: number;
  };
}

export interface ProgressState {
  status: 'idle' | 'loading' | 'complete' | 'error';
  currentBatch: number;
  totalBatches: number;
  message: string;
  recentMessages: ProgressUpdate[];
  walletsProcessed: number;
  totalWallets: number;
}