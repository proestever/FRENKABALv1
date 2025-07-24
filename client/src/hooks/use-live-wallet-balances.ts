import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { WalletData } from '../../../server/types';

interface LiveBalanceUpdate {
  wallet: string;
  token: string;
  balance: string;
  formattedBalance: number;
}

interface LiveWalletData extends WalletData {
  fetchMethod?: string;
  isLiveTracking?: boolean;
}

export function useLiveWalletBalances(address: string | null) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Main query for wallet data using live endpoint
  const query = useQuery<LiveWalletData>({
    queryKey: ['/api/wallet', address, 'live-balances'],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      
      const response = await fetch(`/api/wallet/${address}/live-balances`);
      if (!response.ok) {
        throw new Error(`Failed to fetch wallet data: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: !!address,
    staleTime: 0, // Always consider data stale to allow real-time updates
    gcTime: 5 * 60 * 1000, // Keep data in cache for 5 minutes
  });
  
  // Set up real-time updates
  useEffect(() => {
    if (!address || !query.data) return;
    
    // Create an EventSource connection for real-time updates
    const setupEventSource = () => {
      // For now, we'll poll the status endpoint to check for updates
      // In a future enhancement, we could add Server-Sent Events
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/websocket-status');
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            
            // If WebSocket is connected and we have cached data, check for updates
            if (status.isWebSocketConnected && status.trackedWallets > 0) {
              // Invalidate and refetch data to get latest balances
              queryClient.invalidateQueries({
                queryKey: ['/api/wallet', address, 'live-balances']
              });
            }
          }
        } catch (error) {
          console.error('Failed to check WebSocket status:', error);
        }
      }, 2000); // Poll every 2 seconds for real-time feel
      
      return () => {
        clearInterval(pollInterval);
      };
    };
    
    const cleanup = setupEventSource();
    
    return () => {
      cleanup();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [address, query.data, queryClient]);
  
  // Clean up tracking when component unmounts
  useEffect(() => {
    return () => {
      if (address) {
        // Stop tracking this wallet
        fetch(`/api/wallet/${address}/tracking`, { method: 'DELETE' }).catch(
          error => console.error('Failed to stop wallet tracking:', error)
        );
      }
    };
  }, [address]);
  
  return {
    ...query,
    isLiveTracking: query.data?.fetchMethod === 'live-websocket',
  };
}

// Hook to get WebSocket status
export function useWebSocketStatus() {
  return useQuery({
    queryKey: ['/api/websocket-status'],
    queryFn: async () => {
      const response = await fetch('/api/websocket-status');
      if (!response.ok) {
        throw new Error('Failed to fetch WebSocket status');
      }
      return response.json();
    },
    refetchInterval: 5000, // Check status every 5 seconds
  });
}