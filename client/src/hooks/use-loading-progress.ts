import { useState, useEffect } from 'react';

export interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
}

export function useLoadingProgress(isLoading: boolean): LoadingProgress {
  const [progress, setProgress] = useState<LoadingProgress>({
    currentBatch: 0,
    totalBatches: 0,
    status: 'idle',
    message: ''
  });

  useEffect(() => {
    if (!isLoading) {
      // Reset progress when loading completes
      setProgress({
        currentBatch: 0,
        totalBatches: 0,
        status: 'idle',
        message: ''
      });
      return;
    }

    // When loading starts, set initial state
    setProgress({
      currentBatch: 0,
      totalBatches: 1, // Default to 1 batch until we know better
      status: 'loading',
      message: 'Initializing...'
    });

    // Start polling for progress updates
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/loading-progress');
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        setProgress(data);
        
        // If loading is complete or errored, stop polling
        if (data.status === 'complete' || data.status === 'error') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error fetching loading progress:', error);
      }
    }, 500); // Poll every 500ms

    // Cleanup: stop polling when component unmounts or loading state changes
    return () => clearInterval(interval);
  }, [isLoading]);

  return progress;
}