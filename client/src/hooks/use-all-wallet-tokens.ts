import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllWalletTokens } from '@/lib/api';
import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Hook for retrieving all wallet tokens at once (not paginated)
 * This loads all tokens in a single request, which might be batched on the server
 */
export function useAllWalletTokens(walletAddress: string | null) {
  const queryClient = useQueryClient();
  const prevWalletAddress = useRef<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  
  const [progress, setProgress] = useState({
    currentBatch: 0,
    totalBatches: 1,
    status: 'idle' as 'idle' | 'loading' | 'complete' | 'error',
    message: ''
  });
  
  // Always invalidate the cache for the current wallet address on mount and when wallet changes
  useEffect(() => {
    // Always clear the cache for the current wallet address - even if it's the same as before
    if (walletAddress) {
      console.log('Invalidating cache for wallet:', walletAddress);
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${walletAddress}`] });
      
      // Clear any previous wallet address cache as well
      if (prevWalletAddress.current && prevWalletAddress.current !== walletAddress) {
        console.log('Clearing previous wallet cache:', prevWalletAddress.current);
        queryClient.invalidateQueries({ queryKey: [`wallet-all-${prevWalletAddress.current}`] });
      }
      
      prevWalletAddress.current = walletAddress;
    }
  }, [walletAddress, queryClient]);
  
  // Handle successful CAPTCHA verification
  const handleCaptchaSuccess = useCallback((token: string) => {
    console.log('CAPTCHA verified successfully, token received');
    setCaptchaToken(token);
    setCaptchaRequired(false);
  }, []);
  
  // Reset CAPTCHA state
  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaRequired(false);
  }, []);
  
  // Fetch wallet data with all tokens
  const { 
    data: walletData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: walletAddress ? [`wallet-all-${walletAddress}`, captchaToken] : ['wallet-all-empty'],
    enabled: !!walletAddress,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0, // Consider data always stale to force refetch
    gcTime: 0, // Don't cache between wallet loads (this is TanStack Query v5's replacement for cacheTime)
    queryFn: () => {
      if (!walletAddress) return Promise.reject('No wallet address');
      console.log('Fetching all wallet tokens for:', walletAddress, 'captchaToken:', captchaToken ? 'present' : 'none');
      return fetchAllWalletTokens(walletAddress, captchaToken || undefined)
        .then(data => {
          // Clear captcha token after successful fetch
          if (captchaToken) {
            resetCaptcha();
          }
          return data;
        })
        .catch(error => {
          // Check if error is due to CAPTCHA requirement
          // @ts-ignore - Custom property
          if (error.message === 'CAPTCHA_REQUIRED' || error.captchaRequired) {
            console.log('CAPTCHA required for wallet data fetch');
            setCaptchaRequired(true);
          }
          throw error;
        });
    }
  });
  
  // Poll loading progress during fetching
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    // Only poll when we're actively fetching
    if (isFetching) {
      // Poll loading progress every 500ms
      intervalId = setInterval(async () => {
        try {
          const response = await fetch('/api/loading-progress');
          if (response.ok) {
            const progressData = await response.json();
            setProgress(progressData);
          }
        } catch (error) {
          console.error('Error fetching loading progress:', error);
        }
      }, 500);
    } else {
      // When not fetching, set status to complete or error
      setProgress(prev => ({
        ...prev,
        status: isError ? 'error' : (walletData ? 'complete' : prev.status)
      }));
    }
    
    // Clean up interval on unmount or when fetching status changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isFetching, isError, walletData]);
  
  return {
    walletData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    progress,
    captchaRequired,
    handleCaptchaSuccess,
    resetCaptcha
  };
}