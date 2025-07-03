import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWalletBalancesFromTransferHistory } from '@/lib/api';
import { Wallet } from '@shared/schema';

interface UseTransferHistoryBalanceOptions {
  enabled?: boolean;
  fromBlock?: number;
  toBlock?: number | 'latest';
}

export function useTransferHistoryBalance(
  walletAddress: string | null,
  options: UseTransferHistoryBalanceOptions = {}
) {
  const { enabled = false, fromBlock = 0, toBlock = 'latest' } = options;
  const [isCalculating, setIsCalculating] = useState(false);

  const queryKey = ['transfer-history-balance', walletAddress, fromBlock, toBlock];

  const {
    data: walletData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Wallet, Error>({
    queryKey,
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet address provided');
      
      setIsCalculating(true);
      try {
        console.log('Calculating balances from transfer history for:', walletAddress);
        const data = await fetchWalletBalancesFromTransferHistory(
          walletAddress,
          fromBlock,
          toBlock
        );
        console.log('Transfer history calculation complete:', data);
        return data;
      } finally {
        setIsCalculating(false);
      }
    },
    enabled: !!walletAddress && enabled,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Log calculation progress
  useEffect(() => {
    if (isCalculating) {
      console.log('Transfer history balance calculation in progress...');
    }
  }, [isCalculating]);

  return {
    walletData,
    isLoading: isLoading || isCalculating,
    isError,
    error,
    isFetching,
    refetch,
    isCalculating,
  };
}