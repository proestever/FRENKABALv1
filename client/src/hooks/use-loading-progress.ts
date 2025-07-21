import { useState, useEffect, useRef } from 'react';

export interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
}

/**
 * A hook for accessing loading progress with reduced polling frequency.
 * This polls the server at a moderate rate to update progress while avoiding excessive requests.
 */
export function useLoadingProgress(isLoading: boolean): LoadingProgress {
  const [progress, setProgress] = useState<LoadingProgress>({
    currentBatch: 0,
    totalBatches: 0,
    status: 'idle',
    message: ''
  });
  
  // Use a ref to track the polling interval
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressStagesRef = useRef<string[]>([
    'Initializing wallet data...',
    'Fetching token balances...',
    'Processing token metadata...',
    'Loading price information...',
    'Analyzing portfolio composition...',
    'Resolving token logos...',
    'Checking for liquidity pools...',
    'Calculating total holdings value...',
    'Preparing wallet overview...'
  ]);

  // Function to fetch the current progress from the server
  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/loading-progress');
      if (!response.ok) {
        throw new Error('Failed to fetch loading progress');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching loading progress:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!isLoading) {
      // Reset progress when loading completes
      setProgress({
        currentBatch: 0,
        totalBatches: 0,
        status: 'idle',
        message: ''
      });
      
      // Clear the polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // When loading starts, set initial state
    setProgress({
      currentBatch: 0,
      totalBatches: 1, // Default to 1 batch until we know better
      status: 'loading',
      message: progressStagesRef.current[0]
    });

    let isCancelled = false;
    let progressStageIndex = 0;
    let artificialProgress = 0;
    
    // Make initial request for progress
    fetchProgress().then(data => {
      if (!isCancelled && data && isLoading) {
        setProgress(data);
      }
    });

    // Set up rapid polling during loading to catch all stage transitions
    pollingIntervalRef.current = setInterval(async () => {
      if (isCancelled) return;
      
      // Always fetch real progress from server during loading
      const serverProgress = await fetchProgress();
      if (serverProgress && !isCancelled && isLoading) {
        setProgress(serverProgress);
      }
    }, 200); // Poll every 200ms during loading to catch all stage transitions

    // Cleanup
    return () => {
      isCancelled = true;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isLoading]);

  return progress;
}