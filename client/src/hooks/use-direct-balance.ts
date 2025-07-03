import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDirectBalances } from '@/lib/api';
import { Wallet } from '@shared/schema';

interface UseDirectBalanceOptions {
  enabled?: boolean;
}

export function useDirectBalance(
  walletAddress: string | null,
  options: UseDirectBalanceOptions = {}
) {
  const { enabled = true } = options;
  const [isFetchingDirect, setIsFetchingDirect] = useState(false);

  const queryKey = ['direct-balance', walletAddress];

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
      
      setIsFetchingDirect(true);
      try {
        console.log('Fetching direct balances from blockchain for:', walletAddress);
        const data = await fetchDirectBalances(walletAddress);
        console.log('Direct balance fetch complete:', data);
        return data;
      } finally {
        setIsFetchingDirect(false);
      }
    },
    enabled: !!walletAddress && enabled,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Log fetch progress
  useEffect(() => {
    if (isFetchingDirect) {
      console.log('Direct balance fetch in progress...');
    }
  }, [isFetchingDirect]);

  return {
    walletData,
    isLoading: isLoading || isFetchingDirect,
    isError,
    error,
    isFetching,
    refetch,
    isFetchingDirect,
  };
}