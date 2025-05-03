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

    let isCancelled = false;

    // Start polling for progress updates
    const interval = setInterval(() => {
      if (isCancelled) return;
      
      // Use a safe fetch pattern to avoid unhandled rejections
      fetch('/api/loading-progress')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch loading progress');
          }
          return response.json();
        })
        .then(data => {
          // Only update if the component is still mounted and we're still loading
          if (!isCancelled && isLoading) {
            setProgress(prevProgress => {
              // Only update if the batch number has increased or status changed
              if (data.currentBatch > prevProgress.currentBatch || 
                  data.status !== prevProgress.status ||
                  data.totalBatches !== prevProgress.totalBatches) {
                return data;
              }
              return prevProgress;
            });
          }
          
          // If loading is complete or errored, stop polling
          if (data.status === 'complete' || data.status === 'error') {
            clearInterval(interval);
          }
        })
        .catch(error => {
          console.error('Error fetching loading progress:', error);
        });
    }, 300); // Poll more frequently (300ms instead of 500ms)

    // Cleanup: stop polling when component unmounts or loading state changes
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isLoading]);

  return progress;
}