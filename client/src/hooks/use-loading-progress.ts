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

    // Start polling for progress updates - but use a more intelligent approach
    let consecutiveUnchangedCount = 0;
    let currentPollInterval = 1000; // Start with 1 second interval instead of 300ms
    
    // Define polling function first so we can reference it
    const pollFunction = () => {
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
              // Check if the data has changed
              const hasChanged = 
                data.currentBatch > prevProgress.currentBatch || 
                data.status !== prevProgress.status ||
                data.totalBatches !== prevProgress.totalBatches ||
                data.message !== prevProgress.message;
                
              if (hasChanged) {
                // Reset the unchanged counter when data changes
                consecutiveUnchangedCount = 0;
                
                // If we're making progress, we can be more responsive (but not too aggressive)
                if (currentPollInterval > 1000) {
                  currentPollInterval = 1000;
                  clearInterval(intervalId);
                  intervalId = setInterval(pollFunction, currentPollInterval);
                }
                
                return data;
              } else {
                // Data hasn't changed, increment counter
                consecutiveUnchangedCount++;
                
                // If data hasn't changed for multiple polls, slow down the polling
                if (consecutiveUnchangedCount >= 3) {
                  // Gradually increase poll interval up to 5 seconds
                  const newInterval = Math.min(currentPollInterval * 1.5, 5000);
                  
                  if (newInterval > currentPollInterval) {
                    currentPollInterval = newInterval;
                    clearInterval(intervalId);
                    intervalId = setInterval(pollFunction, currentPollInterval);
                  }
                }
                
                return prevProgress;
              }
            });
          }
          
          // If loading is complete or errored, stop polling immediately
          if (data.status === 'complete' || data.status === 'error') {
            clearInterval(intervalId);
          }
        })
        .catch(error => {
          console.error('Error fetching loading progress:', error);
          // On error, slow down polling even more
          if (currentPollInterval < 5000) {
            currentPollInterval = 5000;
            clearInterval(intervalId);
            intervalId = setInterval(pollFunction, currentPollInterval);
          }
        });
    };
    
    // Start the polling
    let intervalId = setInterval(pollFunction, currentPollInterval);

    // Cleanup: stop polling when component unmounts or loading state changes
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isLoading]);

  return progress;
}