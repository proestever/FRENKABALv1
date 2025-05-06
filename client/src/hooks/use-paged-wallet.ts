import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWalletData } from '@/lib/api';
import { Wallet } from '@shared/schema';

/**
 * Custom hook for handling paginated wallet data with caching
 * This hook avoids refetching all data when just changing pages
 */
export function usePagedWallet(walletAddress: string | null, initialPage: number = 1) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Define a query key base that doesn't include the page
  const baseQueryKey = walletAddress ? `/api/wallet/${walletAddress}` : null;
  
  // The actual query key includes the page number
  const queryKey = walletAddress ? [baseQueryKey, currentPage, captchaToken] : [];

  // Main wallet data query
  const {
    data: walletData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Wallet, Error>({
    queryKey,
    queryFn: () => {
      if (!walletAddress) throw new Error('No address provided');
      console.log('Fetching wallet data for:', walletAddress, 'page:', currentPage);
      return fetchWalletData(walletAddress, currentPage)
        .then(data => {
          console.log('Wallet data fetched successfully');
          return data;
        })
        .catch(error => {
          console.error('Error fetching wallet data:', error);
          throw error;
        });
    },
    enabled: !!walletAddress,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Function to change the current page with optional prefetching
  const changePage = (page: number) => {
    console.log('Changing to page:', page);
    
    // Prefetch the next page
    if (walletAddress && page > currentPage) {
      const nextPage = page + 1;
      console.log('Prefetching next page:', nextPage);
      queryClient.prefetchQuery({
        queryKey: [baseQueryKey, nextPage],
        queryFn: () => fetchWalletData(walletAddress, nextPage),
      });
    }
    
    setCurrentPage(page);
  };

  // Reset page when wallet address changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [walletAddress, initialPage]);
  
  return {
    walletData,
    isLoading,
    isError,
    error,
    isFetching,
    currentPage,
    changePage,
    refetch,
  };
}