// Simple progress types for loading states
export interface SimpleProgress {
  progress: number; // 0-100 percentage
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
  stage?: string;
}

// Legacy interface for compatibility
export interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
  recentMessages?: string[];
  walletsProcessed?: number;
  totalWallets?: number;
}