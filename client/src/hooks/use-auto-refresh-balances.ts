import { useEffect, useRef, useState } from 'react';
import { createSwapDetector, SwapEvent } from '@/lib/swap-detector';
import { useToast } from '@/hooks/use-toast';
import { useDirectWalletBalances } from '@/hooks/use-direct-wallet-balances';
import { queryClient } from '@/lib/queryClient';

interface AutoRefreshBalancesOptions {
  walletAddress: string | null;
  enabled?: boolean;
  notifyOnRefresh?: boolean;
  checkIntervalMs?: number;
}

/**
 * Hook that automatically refreshes wallet balances when swap transactions are detected
 * It uses the direct blockchain balance querying to ensure fresh balance data
 */
export function useAutoRefreshBalances({
  walletAddress,
  enabled = true,
  notifyOnRefresh = true,
  checkIntervalMs = 5000
}: AutoRefreshBalancesOptions) {
  const [lastSwapEvent, setLastSwapEvent] = useState<SwapEvent | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const detectorRef = useRef<ReturnType<typeof createSwapDetector> | null>(null);
  const { toast } = useToast();
  
  // Get direct balance checking functionality
  const {
    refreshBalances,
    isRefreshing,
    isLoading,
    isFetching,
    walletData
  } = useDirectWalletBalances(walletAddress, false); // Don't auto-fetch, we'll trigger manually

  // Set up swap detector
  useEffect(() => {
    // Clean up any existing detector
    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current = null;
    }
    
    // If not enabled or no wallet address, don't set up detector
    if (!enabled || !walletAddress) {
      setIsMonitoring(false);
      return;
    }
    
    // Create new swap detector
    detectorRef.current = createSwapDetector({
      walletAddress,
      checkInterval: checkIntervalMs,
      onSwapDetected: async (event) => {
        console.log('Swap detected:', event);
        setLastSwapEvent(event);
        
        // Wait a short delay to ensure the blockchain state is updated
        const delay = 2000; // 2 seconds
        console.log(`Waiting ${delay}ms before refreshing balances...`);
        
        setTimeout(async () => {
          try {
            // Refresh balances directly from the blockchain
            console.log('Auto-refreshing balances after swap...');
            await refreshBalances();
            
            // Also invalidate the "all" tokens query to ensure all components refresh
            queryClient.invalidateQueries({
              queryKey: [`wallet-all-${walletAddress}`]
            });
            
            // Show success notification if enabled
            if (notifyOnRefresh) {
              toast({
                title: "Balances updated",
                description: "Your wallet balances have been refreshed after your recent transaction.",
                variant: "default",
              });
            }
          } catch (error) {
            console.error('Error refreshing balances after swap:', error);
            
            if (notifyOnRefresh) {
              toast({
                title: "Refresh failed",
                description: "Could not refresh your wallet balances. Please try again manually.",
                variant: "destructive",
              });
            }
          }
        }, delay);
      }
    });
    
    // Start monitoring
    detectorRef.current.start();
    setIsMonitoring(true);
    
    // Cleanup on unmount
    return () => {
      if (detectorRef.current) {
        detectorRef.current.stop();
        detectorRef.current = null;
      }
      setIsMonitoring(false);
    };
  }, [walletAddress, enabled, checkIntervalMs, notifyOnRefresh, refreshBalances]);

  // Function to manually toggle monitoring
  const toggleMonitoring = () => {
    if (!detectorRef.current || !walletAddress) return;
    
    if (isMonitoring) {
      detectorRef.current.stop();
      setIsMonitoring(false);
    } else {
      detectorRef.current.start();
      setIsMonitoring(true);
    }
  };

  return {
    isMonitoring,
    toggleMonitoring,
    lastSwapEvent,
    isRefreshing,
    isLoading,
    isFetching,
    walletData,
    manualRefresh: refreshBalances
  };
}