import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { SearchSection } from '@/components/search-section';
import { WalletOverview } from '@/components/wallet-overview';
import { TokenList } from '@/components/token-list';
import { EmptyState } from '@/components/empty-state';
import { LoadingProgress } from '@/components/loading-progress';
import { ManualTokenEntry } from '@/components/manual-token-entry';
import { saveRecentAddress, ProcessedToken } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAllWalletTokens } from '@/hooks/use-all-wallet-tokens'; // New hook for loading all tokens
import { Wallet, Token } from '@shared/schema';

// Example wallet address
const EXAMPLE_WALLET = '0x592139a3f8cf019f628a152fc1262b8aef5b7199';

export default function Home() {
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);
  const [manualTokens, setManualTokens] = useState<ProcessedToken[]>([]);
  const params = useParams<{ walletAddress?: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Define search function
  const handleSearch = (address: string) => {
    if (!address) return;
    
    // If we're switching to a different address, invalidate React Query cache
    if (searchedAddress !== address) {
      console.log('Switching to new wallet address, clearing cache...');
      
      // Clear any existing wallet cache
      if (searchedAddress) {
        // Invalidate the previous wallet's cache
        queryClient.invalidateQueries({ queryKey: [`wallet-all-${searchedAddress}`] });
      }
      
      // Also invalidate the new wallet's cache to ensure fresh data
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${address}`] });
      
      // Clear any other relevant caches
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
    }
    
    setSearchedAddress(address);
    
    // Update URL to include wallet address
    const currentPath = `/${address}`;
    if (location !== currentPath) {
      setLocation(currentPath);
    }
    
    // Save to recent addresses
    saveRecentAddress(address);
  };

  // Check if we have a wallet address in the URL or if we need to reset
  useEffect(() => {
    // Only process URL params on initial render or when URL actually changes
    if (params.walletAddress && params.walletAddress.startsWith('0x')) {
      if (searchedAddress !== params.walletAddress) {
        // Handle wallet address from URL only if it's different from current
        handleSearch(params.walletAddress);
      }
    } else if (!params.walletAddress && searchedAddress) {
      // Reset state when on the root URL
      setSearchedAddress(null);
    }
  }, [params.walletAddress, searchedAddress]);

  // Use our new hook for loading all wallet tokens without pagination
  const { 
    walletData, 
    isLoading, 
    isError, 
    error, 
    refetch,
    isFetching,
    progress
  } = useAllWalletTokens(searchedAddress)
  
  // Debug wallet data
  useEffect(() => {
    console.log('Wallet data changed:', walletData);
    console.log('isLoading:', isLoading, 'isFetching:', isFetching, 'isError:', isError);
  }, [walletData, isLoading, isFetching, isError]);

  // Handle errors
  useEffect(() => {
    if (isError && error) {
      console.error('Error fetching wallet data:', error);
      toast({
        title: "Error loading wallet data",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  const handleRefresh = () => {
    // Force a complete refresh by invalidating the query first
    if (searchedAddress) {
      // This will clear the cache and force a fresh network request
      console.log('Forcing refresh for wallet:', searchedAddress);
      
      // Aggressively clear all cache related to this wallet
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${searchedAddress}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/wallet/${searchedAddress}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/wallet/${searchedAddress}/all`] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      
      // Also clear the entire query cache to be extra aggressive
      queryClient.clear();
      
      // Then trigger a refetch with cancellation of any in-flight requests
      setTimeout(() => {
        refetch({ cancelRefetch: true });
      }, 50); // Small delay to ensure cache clearing is complete
      
      // Show a toast to confirm the refresh action
      toast({
        title: "Refreshing wallet data",
        description: "Getting the latest blockchain data for this wallet...",
        duration: 3000,
      });
    }
  };

  const handleViewExample = () => {
    handleSearch(EXAMPLE_WALLET);
  };

  // Handle when a token is manually added
  const handleTokenAdded = (token: ProcessedToken) => {
    // Check if token already exists in manual tokens list
    const exists = manualTokens.some(t => t.address.toLowerCase() === token.address.toLowerCase());
    
    if (!exists) {
      // Add the new token to our manual tokens list
      setManualTokens(prev => [...prev, token]);
      
      // Show success toast notification
      toast({
        title: "Token Added",
        description: `${token.name} (${token.symbol}) was successfully added to your wallet view.`,
        variant: "default",
      });
    } else {
      // Update the existing token with fresh data
      setManualTokens(prev => 
        prev.map(t => 
          t.address.toLowerCase() === token.address.toLowerCase() ? token : t
        )
      );
      
      // Show update toast notification
      toast({
        title: "Token Updated",
        description: `${token.name} (${token.symbol}) was refreshed with the latest data.`,
        variant: "default",
      });
    }
  };

  // Combine all tokens - standard API tokens + manually added tokens
  const allTokens = walletData 
    ? [...walletData.tokens, ...manualTokens.filter(t => 
        !walletData.tokens.some((wt: { address: string }) => wt.address.toLowerCase() === t.address.toLowerCase())
      )]
    : manualTokens;

  return (
    <main className="container mx-auto px-4 py-6">
      <SearchSection 
        onSearch={handleSearch} 
        isLoading={isLoading} 
        hasSearched={!!searchedAddress} 
      />
      
      {/* Loading Progress Bar - shows during loading */}
      <LoadingProgress 
        isLoading={isLoading || isFetching} 
        customProgress={progress}
      />
      
      {/* Only show wallet data when not loading */}
      {searchedAddress && !isError && !(isLoading || isFetching) && (
        <>
          <div className="mt-4">
            {walletData && (
              <WalletOverview 
                wallet={walletData} 
                isLoading={false} 
                onRefresh={handleRefresh} 
              />
            )}
            
            {/* Token List with combined tokens */}
            <TokenList 
              tokens={allTokens} 
              isLoading={false} 
              hasError={isError}
              walletAddress={searchedAddress || ''}
            />
          </div>
        </>
      )}
      
      {searchedAddress && isError && (
        <>
          <div className="mt-4">
            {/* Token list with manually added tokens */}
            <TokenList 
              tokens={manualTokens} 
              isLoading={false} 
              hasError={true}
              walletAddress={searchedAddress} 
            />
            
            {/* Manual Token Entry removed as requested */}
          </div>
        </>
      )}
      
      {/* Empty state card hidden as requested */}
    </main>
  );
}