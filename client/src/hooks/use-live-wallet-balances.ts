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
    
    // Disabled polling - was causing excessive API calls every 2 seconds
    // Real-time updates should be handled by WebSocket events, not polling
    // TODO: Implement proper Server-Sent Events or WebSocket integration
    
    return () => {
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
    // Disabled refetchInterval - was polling every 5 seconds unnecessarily
    refetchInterval: false,
  });
}