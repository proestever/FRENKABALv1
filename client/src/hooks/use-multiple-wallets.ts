import { useQuery } from '@tanstack/react-query';
import { fetchMultipleWallets } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Wallet } from '@shared/schema';

/**
 * Custom hook for loading data from multiple wallet addresses
 */
export function useMultipleWallets(addresses: string[] = []) {
  const [walletAddresses, setWalletAddresses] = useState<string[]>(addresses);
  
  // Progress tracking state
  const [progress, setProgress] = useState({
    currentBatch: 0,
    totalBatches: 1,
    status: 'idle' as 'idle' | 'loading' | 'complete' | 'error',
    message: ''
  });
  
  // Clean up addresses and filter out any empty ones
  const validAddresses = walletAddresses.filter(addr => 
    addr && typeof addr === 'string' && addr.startsWith('0x')
  );
  
  // Generate a stable query key
  const queryKey = ['multiple-wallets', validAddresses.sort().join(',')];
  
  // Fetch data for multiple wallets at once
  const { 
    data: walletsData, 
    isLoading, 
    isError, 
    error,
    isFetching,
    refetch 
  } = useQuery<Record<string, Wallet>>({
    queryKey,
    queryFn: () => {
      if (validAddresses.length === 0) {
        return Promise.resolve({});
      }
      
      console.log(`Fetching data for ${validAddresses.length} wallets:`, validAddresses);
      return fetchMultipleWallets(validAddresses);
    },
    enabled: validAddresses.length > 0,
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
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
        status: isError ? 'error' : (walletsData ? 'complete' : prev.status)
      }));
    }
    
    // Clean up interval on unmount or when fetching status changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isFetching, isError, walletsData]);

  // Add a new wallet address to the list
  const addWalletAddress = (address: string) => {
    if (!address) return;
    
    // Convert to lowercase for consistency
    const normalizedAddress = address.toLowerCase();
    
    // Only add if it's not already in the list
    if (!walletAddresses.some(addr => addr.toLowerCase() === normalizedAddress)) {
      setWalletAddresses(prev => [...prev, address]);
    }
  };
  
  // Remove a wallet address from the list
  const removeWalletAddress = (address: string) => {
    if (!address) return;
    
    // Convert to lowercase for consistency
    const normalizedAddress = address.toLowerCase();
    
    setWalletAddresses(prev => 
      prev.filter(addr => addr.toLowerCase() !== normalizedAddress)
    );
  };
  
  // Clear all wallet addresses
  const clearWalletAddresses = () => {
    setWalletAddresses([]);
  };
  
  // Calculate the total value across all wallets
  const totalValue = walletsData ? 
    Object.values(walletsData).reduce((sum, wallet) => sum + (wallet?.totalValue || 0), 0) 
    : 0;
  
  // Calculate the total number of tokens across all wallets
  const totalTokens = walletsData ? 
    Object.values(walletsData).reduce((sum, wallet) => sum + (wallet?.tokenCount || 0), 0)
    : 0;
  
  return {
    walletsData,
    isLoading,
    isError,
    error,
    isFetching,
    progress,
    refetch,
    walletAddresses,
    addWalletAddress,
    removeWalletAddress,
    clearWalletAddresses,
    totalValue,
    totalTokens
  };
}