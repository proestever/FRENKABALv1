import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWalletDataClientSide, fetchWalletDataWithContractPrices, fetchMissingLogosInBackground } from '@/services/wallet-client-service';
import { useRealTimePrices } from './use-real-time-prices';

// Define types locally since they're not in shared schema
interface ProcessedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  exchange?: string;
  verified?: boolean;
  securityScore?: number;
  isNative?: boolean;
  isLp?: boolean;
}

interface Wallet {
  address: string;
  tokens: ProcessedToken[];
  totalValue: number;
  tokenCount: number;
  plsBalance: number | undefined;
  plsPriceChange: number | undefined;
  networkCount: number;
  pricesNeeded?: boolean;
}

interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
}

/**
 * Hook that fetches wallet data with client-side DexScreener price fetching
 * This avoids server rate limits by distributing API calls across users
 */
export function useClientSideWallet(walletAddress: string | null) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<LoadingProgress>({
    currentBatch: 0,
    totalBatches: 100,
    status: 'idle',
    message: ''
  });
  
  // Track if background logo fetch has been triggered
  const backgroundFetchTriggered = useRef(false);
  
  const { 
    data: walletData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery<Wallet | null>({
    queryKey: walletAddress ? [`client-wallet-${walletAddress}`] : ['client-wallet-empty'],
    enabled: !!walletAddress,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      if (!walletAddress) return null;
      
      try {
        // Fetch wallet data with direct smart contract price reading (real-time)
        const data = await fetchWalletDataWithContractPrices(walletAddress, (message, progress) => {
          setProgress({
            currentBatch: progress,
            totalBatches: 100,
            status: 'loading',
            message
          });
        });
        
        // Set complete status
        setProgress({
          currentBatch: 100,
          totalBatches: 100,
          status: 'complete',
          message: `Successfully loaded ${data.tokens.length} tokens`
        });
        
        return data;
      } catch (error) {
        setProgress({
          currentBatch: 0,
          totalBatches: 100,
          status: 'error',
          message: 'Error loading wallet data'
        });
        throw error;
      }
    },
  });
  
  // Trigger background logo fetch for tokens without logos
  useEffect(() => {
    if (walletData && walletData.tokens && !backgroundFetchTriggered.current) {
      backgroundFetchTriggered.current = true;
      
      // Start background logo fetching immediately
      fetchMissingLogosInBackground(walletData.tokens).catch(error => {
        console.error('Background logo fetch error:', error);
      });
    }
  }, [walletData]);
  
  // Reset background fetch flag when wallet changes
  useEffect(() => {
    backgroundFetchTriggered.current = false;
  }, [walletAddress]);
  
  // Poll for loading progress from server (only for initial blockchain data fetch)
  useEffect(() => {
    if (!isFetching || progress.status === 'complete') return;
    
    const pollProgress = async () => {
      try {
        const response = await fetch('/api/loading-progress');
        if (response.ok) {
          const serverProgress = await response.json();
          
          // Only update progress for the blockchain data fetch part (up to 30%)
          if (serverProgress.status === 'loading' && serverProgress.currentBatch > 0) {
            // Map server progress (0-100) to our first phase (0-30)
            const mappedProgress = Math.min(serverProgress.currentBatch * 0.3, 30);
            setProgress(prev => ({
              ...prev,
              currentBatch: mappedProgress,
              message: serverProgress.message
            }));
          }
        }
      } catch (error) {
        // Ignore polling errors
      }
    };
    
    const interval = setInterval(pollProgress, 200);
    return () => clearInterval(interval);
  }, [isFetching, progress.status]);
  
  // Enable real-time price updates when wallet data is loaded
  const { refreshPrices } = useRealTimePrices({
    walletAddress: walletAddress || '',
    tokens: walletData?.tokens || [],
    enabled: !!walletData && !isLoading && !isFetching,
    intervalMs: 5000 // Update every 5 seconds
  });
  
  return {
    walletData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    refreshPrices,
    progress
  };
}