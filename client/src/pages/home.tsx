import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const { toast } = useToast();

  const { 
    data: walletData, 
    isLoading, 
    isError, 
    error, 
    refetch,
    isFetching 
  } = useQuery<Wallet, Error>({
    queryKey: searchedAddress ? [`/api/wallet/${searchedAddress}`] : [],
    queryFn: async () => {
      if (!searchedAddress) throw new Error('No address provided');
      console.log('Fetching wallet data for:', searchedAddress);
      return fetchWalletData(searchedAddress);
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

  const handleSearch = (address: string) => {
    if (!address) return;
    
    setSearchedAddress(address);
    
    // Save to recent addresses
    saveRecentAddress(address);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleViewExample = () => {
    handleSearch(EXAMPLE_WALLET);
  };

  return (
    <main className="container mx-auto px-4 py-6">
      <SearchSection onSearch={handleSearch} isLoading={isLoading} />
      
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
            />
          </div>
        </>
      )}
      
      {searchedAddress && isError && (
        <TokenList 
          tokens={[]} 
          isLoading={false} 
          hasError={true} 
        />
      )}
      
      {!searchedAddress && (
        <EmptyState onViewExample={handleViewExample} />
      )}
    </main>
  );
}
