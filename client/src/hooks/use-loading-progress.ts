import { useState, useEffect } from 'react';

export interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
}

/**
 * A hook for accessing loading progress without continuous polling.
 * This uses a single fetch on initial load and when loading status changes.
 */
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
      message: 'Initializing wallet data...'
    });

    let isCancelled = false;

    // Make a SINGLE request to get the current progress
    // Instead of continuous polling, we'll just get the initial state
    fetch('/api/loading-progress')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch loading progress');
        }
        return response.json();
      })
      .then(data => {
        if (!isCancelled && isLoading) {
          setProgress(data);
        }
      })
      .catch(error => {
        console.error('Error fetching loading progress:', error);
      });

    // Cleanup
    return () => {
      isCancelled = true;
    };
  }, [isLoading]);

  return progress;
}