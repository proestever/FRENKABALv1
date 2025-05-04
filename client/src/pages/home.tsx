import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { SearchSection } from '@/components/search-section';
import { WalletOverview } from '@/components/wallet-overview';
import { TokenList } from '@/components/token-list';
import { EmptyState } from '@/components/empty-state';
import { LoadingProgress } from '@/components/loading-progress';
import { fetchWalletData, saveRecentAddress } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Token } from '@shared/schema';

// Example wallet address
const EXAMPLE_WALLET = '0x592139a3f8cf019f628a152fc1262b8aef5b7199';

export default function Home() {
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);
  const params = useParams<{ walletAddress?: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Define search function
  const handleSearch = (address: string) => {
    if (!address) return;
    
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

  const { 
    data: walletData, 
    isLoading, 
    isError, 
    error, 
    refetch,
    isFetching 
  } = useQuery<Wallet, Error>({
    queryKey: searchedAddress ? [`/api/wallet/${searchedAddress}`] : [],
    queryFn: () => {
      if (!searchedAddress) throw new Error('No address provided');
      console.log('Fetching wallet data for:', searchedAddress);
      return fetchWalletData(searchedAddress)
        .then(data => {
          console.log('Wallet data fetched successfully');
          return data;
        })
        .catch(error => {
          console.error('Error fetching wallet data:', error);
          throw error;
        });
    },
    enabled: !!searchedAddress,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 2 * 60 * 1000, // 2 minutes (previously cacheTime in v4)
    retry: 1,
    refetchOnWindowFocus: false // Don't refetch when window gets focus
  });
  
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
    refetch();
  };

  const handleViewExample = () => {
    handleSearch(EXAMPLE_WALLET);
  };

  return (
    <main className="container mx-auto px-4 py-6">
      <SearchSection 
        onSearch={handleSearch} 
        isLoading={isLoading} 
        hasSearched={!!searchedAddress} 
      />
      
      {/* Loading Progress Bar - shows during loading */}
      <LoadingProgress isLoading={isLoading || isFetching} />
      
      {searchedAddress && walletData && !isError && (
        <>
          <div className="mt-4">
            <WalletOverview 
              wallet={walletData} 
              isLoading={isLoading || isFetching} 
              onRefresh={handleRefresh} 
            />
            <TokenList 
              tokens={walletData.tokens} 
              isLoading={isLoading || isFetching} 
              hasError={isError}
              walletAddress={searchedAddress || ''}
            />
          </div>
        </>
      )}
      
      {searchedAddress && isError && (
        <TokenList 
          tokens={[]} 
          isLoading={false} 
          hasError={true}
          walletAddress={searchedAddress} 
        />
      )}
      
      {/* Empty state card hidden as requested */}
    </main>
  );
}