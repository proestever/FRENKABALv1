import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { SearchSection } from '@/components/search-section';
import { WalletOverview } from '@/components/wallet-overview';
import { TokenList } from '@/components/token-list';
import { EmptyState } from '@/components/empty-state';
import { LoadingProgress } from '@/components/loading-progress';
import { ManualTokenEntry } from '@/components/manual-token-entry';
import ApiStats from '@/components/api-stats';
import { Button } from '@/components/ui/button';
import { saveRecentAddress, ProcessedToken, fetchWalletData, fetchAllWalletTokens, forceRefreshWalletData } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAllWalletTokens } from '@/hooks/use-all-wallet-tokens'; // New hook for loading all tokens
import { useHexStakes, fetchHexStakesSummary, fetchCombinedHexStakes, HexStakeSummary } from '@/hooks/use-hex-stakes'; // For preloading HEX stakes data
import { Wallet, Token } from '@shared/schema';
import { combineWalletData } from '@/lib/utils';

// Example wallet address
const EXAMPLE_WALLET = '0x592139a3f8cf019f628a152fc1262b8aef5b7199';

export default function Home() {
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);
  const [manualTokens, setManualTokens] = useState<ProcessedToken[]>([]);
  const [multiWalletData, setMultiWalletData] = useState<Record<string, Wallet> | null>(null);
  const [multiWalletHexStakes, setMultiWalletHexStakes] = useState<HexStakeSummary | null>(null);
  const [individualWalletHexStakes, setIndividualWalletHexStakes] = useState<Record<string, HexStakeSummary>>({});
  const [isMultiWalletLoading, setIsMultiWalletLoading] = useState(false);
  const [portfolioName, setPortfolioName] = useState<string | null>(null);
  const [portfolioUrlId, setPortfolioUrlId] = useState<string | null>(null);
  const [multiWalletProgress, setMultiWalletProgress] = useState<{
    currentBatch: number;
    totalBatches: number;
    status: 'idle' | 'loading' | 'complete' | 'error';
    message: string;
  }>({
    currentBatch: 0,
    totalBatches: 0,
    status: 'idle',
    message: ''
  });
  const params = useParams<{ walletAddress?: string; portfolioId?: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Listen for the custom reset event from logo click
  useEffect(() => {
    const handleResetSearch = () => {
      console.log("Received custom reset event from logo click");
      // Complete reset of all state
      setSearchedAddress(null);
      setMultiWalletData(null);
      setMultiWalletHexStakes(null);
      setPortfolioName(null);
      setPortfolioUrlId(null);
      setIndividualWalletHexStakes({});
      setManualTokens([]);
      
      // Show toast to confirm action
      toast({
        title: "Reset complete",
        description: "Search has been reset to the home screen."
      });
    };
    
    // Add event listener for the custom reset event
    window.addEventListener('frenklabal:reset-search', handleResetSearch);
    
    // Cleanup
    return () => {
      window.removeEventListener('frenklabal:reset-search', handleResetSearch);
    };
  }, [toast]);
  
  // Define search function for a single wallet address
  const handleSearch = (address: string) => {
    if (!address) return;
    
    // Clear multi-wallet data if we're switching to single wallet view
    if (multiWalletData) {
      setMultiWalletData(null);
    }
    
    // Always invalidate cache to ensure fresh data, even when searching for the same address
    console.log('Searching wallet address, clearing cache to ensure fresh data:', address);
    
    // Clear any existing wallet cache
    if (searchedAddress) {
      // Invalidate the previous wallet's cache
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${searchedAddress}`] });
    }
    
    // Always invalidate the new wallet's cache to ensure fresh data
    queryClient.invalidateQueries({ queryKey: [`wallet-all-${address}`] });
    
    // Clear any other relevant caches
    queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
    
    // For the same address, we'll force a fresh fetch by first clearing the address and then setting it back
    if (searchedAddress === address) {
      // Temporarily clear the address (this will cancel any in-flight requests)
      setSearchedAddress(null);
      
      // Use setTimeout to ensure the state update has completed before setting it back
      setTimeout(() => {
        setSearchedAddress(address);
      }, 10);
    } else {
      // For new addresses, just set it directly
      setSearchedAddress(address);
    }
    
    // Update URL to include wallet address
    const currentPath = `/${address}`;
    if (location !== currentPath) {
      setLocation(currentPath);
    }
    
    // Save to recent addresses
    saveRecentAddress(address);
    
    // Preload HEX stakes data in parallel to speed up tab switching
    console.log('Preloading HEX stakes data for wallet:', address);
    // We don't await this - let it run in the background
    fetchHexStakesSummary(address).catch((err: Error) => {
      console.warn('Preloading HEX stakes failed:', err.message);
      // We can safely ignore errors here since it will be retried when the tab is opened
    });
  };
  
  // Handle multi-wallet search
  const handleMultiSearch = async (addresses: string[]) => {
    if (!addresses.length) return;
    
    // Reset single wallet view
    setSearchedAddress(null);
    
    // Update URL to show we're in multi-wallet mode
    const firstAddress = addresses[0];
    const currentPath = `/${firstAddress}`;
    if (location !== currentPath) {
      setLocation(currentPath);
    }
    
    // Save the first address to recent addresses
    saveRecentAddress(firstAddress);
    
    setIsMultiWalletLoading(true);
    setMultiWalletData(null);
    
    // Create and set our custom progress state for multi-wallet loading
    const customProgressState = {
      currentBatch: 0,
      totalBatches: addresses.length,
      status: 'loading' as const,
      message: `Preparing to load ${addresses.length} wallets...`
    };
    
    // Set initial progress
    setMultiWalletProgress(customProgressState);
    
    try {
      console.log(`Fetching data for ${addresses.length} wallets individually`);
      
      // Instead of loading all wallets in parallel, process them sequentially
      // to provide better progress indication
      const walletResults = [];
      
      // Start with fetching combined HEX stakes data
      setMultiWalletProgress({
        ...customProgressState,
        message: 'Fetching combined HEX stakes data...'
      });
      
      const hexStakesPromise = fetchCombinedHexStakes(addresses).catch(error => {
        console.error('Error fetching combined HEX stakes:', error);
        return null;
      });
      
      // Process each wallet address sequentially for better progress tracking
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        
        // Update progress for this wallet
        setMultiWalletProgress({
          currentBatch: i + 1,
          totalBatches: addresses.length,
          status: 'loading',
          message: `Loading wallet ${i + 1}/${addresses.length}: ${address.substring(0, 6)}...${address.substring(address.length - 4)}`
        });
        
        try {
          // Fetch wallet data
          const response = await fetch(`/api/wallet/${address}/all`);
          
          if (!response.ok) {
            console.warn(`Failed to fetch wallet ${address}`);
            walletResults.push(null);
          } else {
            const data = await response.json();
            walletResults.push({ [address]: data });
          }
        } catch (error) {
          console.error(`Error fetching wallet ${address}:`, error);
          walletResults.push(null);
        }
      }
      
      // Wait for the hex stakes data to complete
      const hexStakesData = await hexStakesPromise;
      
      // Update progress for HEX stakes data
      setMultiWalletProgress({
        currentBatch: addresses.length,
        totalBatches: addresses.length,
        status: 'loading',
        message: 'Fetching individual HEX stakes data...'
      });
      
      // Fetch individual HEX stakes data for each wallet
      const individualHexStakesPromises = addresses.map(address => 
        fetchHexStakesSummary(address)
          .then(data => ({ [address]: data }))
          .catch(error => {
            console.error(`Error fetching HEX stakes for ${address}:`, error);
            return null;
          })
      );
      
      // Process individual HEX stakes data
      const individualHexResults = await Promise.all(individualHexStakesPromises);
      const individualHexData = individualHexResults
        .filter(result => result !== null)
        .reduce((acc, result) => ({ ...acc, ...result }), {});
      
      // Store individual wallet HEX stakes data
      setIndividualWalletHexStakes(individualHexData);
      
      // Filter out null results and combine into a single object
      const walletData = walletResults
        .filter(result => result !== null)
        .reduce((acc, result) => ({ ...acc, ...result }), {});
      
      // Check if we got any data
      if (Object.keys(walletData).length === 0) {
        toast({
          title: "No wallet data found",
          description: "Could not find data for any of the provided addresses",
          variant: "destructive"
        });
        return;
      }
      
      // Store the HEX stakes data for the combined view
      if (hexStakesData) {
        console.log('Combined HEX stakes data received:', hexStakesData);
        setMultiWalletHexStakes(hexStakesData);
      } else {
        console.log('No combined HEX stakes data received');
      }
      
      // Update progress to show we're in the final steps
      setMultiWalletProgress({
        currentBatch: addresses.length,
        totalBatches: addresses.length,
        status: 'complete',
        message: `Successfully loaded ${Object.keys(walletData).length} wallets with ${individualHexResults.filter(r => r !== null).length} HEX stake summaries`
      });
      
      setMultiWalletData(walletData);
      
      toast({
        title: "Multi-wallet search completed",
        description: `Loaded data for ${Object.keys(walletData).length} wallets`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error fetching multiple wallets:', error);
      
      // Update progress to show error
      setMultiWalletProgress({
        currentBatch: 0,
        totalBatches: addresses.length,
        status: 'error',
        message: error instanceof Error ? error.message : "An unknown error occurred when loading wallets"
      });
      
      toast({
        title: "Error fetching wallet data",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      // Add a slight delay before setting loading to false to ensure progress is visible
      setTimeout(() => {
        setIsMultiWalletLoading(false);
      }, 1000);
    }
  };

  // Parse URL query parameters
  const parseQueryString = (search: string): Record<string, string> => {
    if (!search || search === '?') return {};
    
    return search
      .substring(1)
      .split('&')
      .reduce((params, param) => {
        const [key, value] = param.split('=');
        if (key && value) params[key] = decodeURIComponent(value);
        return params;
      }, {} as Record<string, string>);
  };

  // Check if we have a wallet address in the URL, portfolio ID in the path, or addresses in query params
  useEffect(() => {
    const search = window.location.search;
    const queryParams = parseQueryString(search);
    
    // Check if we have a wallet address directly in the URL path
    if (params.walletAddress && params.walletAddress.startsWith('0x')) {
      console.log(`Detected wallet address in URL params: ${params.walletAddress}`);
      handleSearch(params.walletAddress);
      return;
    }
    
    // First check if we're using the clean portfolio URL format (/portfolio/:portfolioId)
    if (params.portfolioId || location.startsWith('/portfolio/')) {
      // Get the portfolio ID either from params or from the URL
      const portfolioId = params.portfolioId || location.split('/')[2];
      console.log(`Loading portfolio with ID: ${portfolioId}`);
      
      // Get portfolio data from session storage
      const portfolioData = sessionStorage.getItem(`portfolio_${portfolioId}`);
      
      if (portfolioData) {
        try {
          const { addresses, name } = JSON.parse(portfolioData);
          
          if (addresses && addresses.length > 0) {
            // Set portfolio name for display
            setPortfolioName(name);
            console.log(`Portfolio name from session storage: ${name}`);
            
            // Filter out any invalid addresses
            const validAddresses = addresses.filter((addr: string) => addr.startsWith('0x'));
            if (validAddresses.length > 0) {
              // Use multi-search to load all the wallet data
              handleMultiSearch(validAddresses);
              return;
            }
          }
        } catch (error) {
          console.error('Error parsing portfolio data from session storage:', error);
        }
      }
      
      // If we can't find portfolio data in session storage, try to fetch it from the API
      const fetchPortfolioData = async () => {
        try {
          const response = await fetch(`/api/portfolios/${portfolioId}/wallet-addresses`);
          const result = await response.json();
          
          if (result && result.walletAddresses && result.walletAddresses.length > 0) {
            setPortfolioName(result.portfolioName);
            console.log(`Portfolio name from API: ${result.portfolioName}`);
            
            // Filter out any invalid addresses
            const validAddresses = result.walletAddresses.filter((addr: string) => addr.startsWith('0x'));
            if (validAddresses.length > 0) {
              handleMultiSearch(validAddresses);
            }
          } else {
            // Could not find wallet addresses for this portfolio
            toast({
              title: "Portfolio not found",
              description: "Could not find wallet addresses for this portfolio.",
              variant: "destructive"
            });
            
            // Redirect to homepage
            setLocation('/');
          }
        } catch (error) {
          console.error('Error fetching portfolio data from API:', error);
          toast({
            title: "Error loading portfolio",
            description: "Failed to load portfolio data.",
            variant: "destructive"
          });
          
          // Redirect to homepage
          setLocation('/');
        }
      };
      
      fetchPortfolioData();
      return;
    }
    
    // Legacy support for the old query parameter format
    if (queryParams.addresses) {
      const addressList = queryParams.addresses.split(',');
      console.log(`Loading portfolio with ${addressList.length} addresses (legacy URL format)`);
      
      // Extract portfolio information from URL if available
      if (queryParams.name) {
        setPortfolioName(queryParams.name);
        console.log(`Portfolio name: ${queryParams.name}`);
      }
      
      if (queryParams.uid) {
        setPortfolioUrlId(queryParams.uid);
        console.log(`Portfolio URL ID: ${queryParams.uid}`);
      }
      
      if (addressList.length > 0) {
        // Filter out any invalid addresses
        const validAddresses = addressList.filter((addr: string) => addr.startsWith('0x'));
        if (validAddresses.length > 0) {
          handleMultiSearch(validAddresses);
          return;
        }
      }
    } else {
      // If we don't have portfolio addresses, reset portfolio name and URL ID
      setPortfolioName(null);
      setPortfolioUrlId(null);
    }
    
    // Handle single wallet address from URL path
    if (params.walletAddress && params.walletAddress.startsWith('0x')) {
      if (searchedAddress !== params.walletAddress) {
        // Handle wallet address from URL only if it's different from current
        handleSearch(params.walletAddress);
      }
    } else if (!params.walletAddress && !params.portfolioId && location === '/') {
      // Complete reset of state when on the root URL after logo click
      setSearchedAddress(null);
      setMultiWalletData(null);
      setMultiWalletHexStakes(null);
      setPortfolioName(null);
      setPortfolioUrlId(null);
      setIndividualWalletHexStakes({});
    }
  }, [params.walletAddress, params.portfolioId, searchedAddress, location]);

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
    // Force a complete refresh using our dedicated force refresh endpoint
    if (searchedAddress) {
      // Log the refresh attempt
      console.log('Forcing refresh for wallet:', searchedAddress);
      
      // Set loading status
      const startTime = Date.now();
      
      // First invalidate the queries to clear the client-side cache
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${searchedAddress}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/wallet/${searchedAddress}`] });
      
      // Show initial toast to indicate refresh is in progress
      toast({
        title: "Force Refreshing Wallet Data",
        description: "Bypassing cache and getting fresh data directly from the blockchain...",
        duration: 3000,
      });
      
      // Use the dedicated force refresh endpoint that completely bypasses cache
      forceRefreshWalletData(searchedAddress)
        .then(freshData => {
          // Calculate how long the refresh took
          const refreshTime = ((Date.now() - startTime) / 1000).toFixed(1);
          
          // Explicitly invalidate all related queries
          queryClient.invalidateQueries({ queryKey: [`wallet-all-${searchedAddress}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/wallet/${searchedAddress}`] });
          
          // Force a refetch to update the UI with new data
          refetch({ cancelRefetch: true });
          
          // Show success toast
          toast({
            title: "Refresh Complete",
            description: `Successfully refreshed data in ${refreshTime}s with ${freshData.tokens.length} tokens`,
            duration: 3000,
          });
        })
        .catch(err => {
          console.error('Error during force refresh:', err);
          toast({
            title: "Refresh Failed",
            description: err instanceof Error ? err.message : "Could not refresh wallet data",
            variant: "destructive",
            duration: 5000,
          });
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
      {/* Only show the search section at the top if no wallet has been searched yet and not in multi-wallet mode */}
      {!searchedAddress && !multiWalletData && (
        <SearchSection 
          onSearch={handleSearch}
          onMultiSearch={handleMultiSearch}
          isLoading={isLoading || isMultiWalletLoading} 
          hasSearched={false}
        />
      )}
      
      {/* Loading Progress Bar - shows during loading */}
      <LoadingProgress 
        isLoading={isLoading || isFetching || isMultiWalletLoading} 
        customProgress={isMultiWalletLoading ? multiWalletProgress : progress}
      />
      
      {/* Multi-wallet results section */}
      {multiWalletData && !isMultiWalletLoading && (
        <>
          <div className="mt-4 mb-6">
            <div className="w-full">
              <SearchSection 
                onSearch={handleSearch}
                onMultiSearch={handleMultiSearch}
                isLoading={isMultiWalletLoading} 
                hasSearched={true} 
              />
            </div>
          </div>
          
          {/* Create a combined wallet view from all wallets */}
          {(() => {
            // Generate the combined wallet data
            const combinedWallet = combineWalletData(multiWalletData);
            
            // Override the address property with portfolio name if available
            if (portfolioName) {
              console.log(`Setting combined wallet address to Portfolio:${portfolioName}`);
              combinedWallet.address = `Portfolio:${portfolioName}`;
            } else {
              console.log(`No portfolio name available, using default Combined address`);
              combinedWallet.address = `Combined (${Object.keys(multiWalletData).length} wallets)`;
            }
            
            // Add HEX stakes value to total wallet value if available
            if (multiWalletHexStakes && multiWalletHexStakes.totalCombinedValueUsd) {
              combinedWallet.totalValue += multiWalletHexStakes.totalCombinedValueUsd;
              console.log('Added HEX stakes value of', multiWalletHexStakes.totalCombinedValueUsd, 
                          'to total. New total:', combinedWallet.totalValue);
            }
            
            return (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Left column - Combined Wallet Overview */}
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
                  {/* Debug portfolio name - remove in production */}
                  {portfolioName && (
                    <div className="mb-2 p-2 bg-purple-500/20 border border-purple-500/40 rounded text-xs">
                      Debug: Portfolio name = "{portfolioName}"
                    </div>
                  )}
                  <WalletOverview 
                    wallet={combinedWallet} 
                    isLoading={false}
                    hexStakesSummary={multiWalletHexStakes}
                    portfolioName={portfolioName || undefined}
                    onRefresh={() => {
                      // Refresh all wallets by re-fetching
                      if (multiWalletData) {
                        handleMultiSearch(Object.keys(multiWalletData));
                      }
                    }}
                  />
                  
                  {/* Show individual wallet cards below the main overview */}
                  <div className="glass-card p-4 border border-white/20 rounded-md">
                    <h3 className="text-lg font-semibold mb-3">
                      Individual Wallets ({Object.keys(multiWalletData).length})
                    </h3>
                    
                    <div className="space-y-3">
                      {Object.entries(multiWalletData).map(([address, wallet]) => {
                        // Find if we have HEX stakes for this wallet
                        const walletHexStakes = individualWalletHexStakes[address];
                        
                        // Calculate total value including HEX stakes
                        let totalValue = wallet.totalValue || 0;
                        let hexStakeValue = 0;
                        
                        if (walletHexStakes && walletHexStakes.totalCombinedValueUsd) {
                          hexStakeValue = walletHexStakes.totalCombinedValueUsd;
                          totalValue += hexStakeValue;
                          console.log(`Added ${hexStakeValue} in HEX stakes to wallet ${address}`);
                        }
                        
                        return (
                          <div key={address} className="border border-white/10 rounded-md p-3">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="text-sm font-medium truncate max-w-[160px]">
                                {address}
                              </h4>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 px-2 py-0 text-xs" 
                                onClick={() => handleSearch(address)}
                              >
                                Details
                              </Button>
                            </div>
                            
                            <div className="text-xs mb-1">
                              <span className="opacity-70">Value (with HEX Stakes):</span>{' '}
                              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {hexStakeValue > 0 && (
                                <span className="text-xs text-purple-300 ml-1">
                                  (includes ${hexStakeValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} in HEX stakes)
                                </span>
                              )}
                            </div>
                            
                            <div className="text-xs">
                              <span className="opacity-70">Tokens:</span>{' '}
                              {wallet.tokenCount}
                              {walletHexStakes && walletHexStakes.stakeCount > 0 && (
                                <span className="text-purple-300 ml-2">
                                  + {walletHexStakes.stakeCount} HEX {walletHexStakes.stakeCount === 1 ? 'stake' : 'stakes'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Right column - Combined Token List */}
                <div className="w-full lg:w-2/3">
                  <TokenList 
                    tokens={combinedWallet.tokens} 
                    isLoading={false} 
                    hasError={false}
                    walletAddress={combinedWallet.address}
                    otherWalletAddresses={Object.keys(multiWalletData)}
                    isMultiWallet={true}
                  />
                </div>
              </div>
            );
          })()}
        </>
      )}
      
      {/* Single wallet view - only show wallet data when not loading */}
      {searchedAddress && !isError && !(isLoading || isFetching) && !multiWalletData && (
        <>
          <div className="mt-4">
            {/* Two-column layout: Wallet overview (1/3) on left, Token list (2/3) on right */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left column - Wallet Overview (1/3 width on large screens) */}
              <div className="w-full lg:w-1/3 flex flex-col gap-6">
                {walletData && (
                  <WalletOverview 
                    wallet={walletData} 
                    isLoading={false} 
                    onRefresh={handleRefresh}
                  />
                )}
                
                {/* Search bar placed below the wallet overview */}
                <div className="w-full">
                  <SearchSection 
                    onSearch={handleSearch}
                    onMultiSearch={handleMultiSearch}
                    isLoading={isLoading} 
                    hasSearched={true} 
                  />
                </div>
              </div>
              
              {/* Right column - Token List (2/3 width on large screens) */}
              <div className="w-full lg:w-2/3">
                {/* Token List with combined tokens */}
                <TokenList 
                  tokens={allTokens} 
                  isLoading={false} 
                  hasError={isError}
                  walletAddress={searchedAddress || ''}
                />
              </div>
            </div>
          </div>
        </>
      )}
      
      {searchedAddress && isError && (
        <>
          <div className="mt-4">
            {/* Two-column layout in error state for consistency */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left column - Error message and search bar */}
              <div className="w-full lg:w-1/3 flex flex-col gap-6">
                {/* Error card */}
                <div className="glass-card p-6 w-full text-center border-red-500/20 shadow-lg border">
                  <div className="text-red-400 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white">Error Loading Wallet</h3>
                  <p className="text-sm text-white/60 mt-1">Unable to fetch wallet overview data</p>
                </div>
                
                {/* Search bar below error message */}
                <div className="w-full">
                  <SearchSection 
                    onSearch={handleSearch}
                    onMultiSearch={handleMultiSearch}
                    isLoading={isLoading} 
                    hasSearched={true} 
                  />
                </div>
              </div>
              
              {/* Right column - Token List (2/3 width on large screens) */}
              <div className="w-full lg:w-2/3">
                {/* Token list with manually added tokens */}
                <TokenList 
                  tokens={manualTokens} 
                  isLoading={false} 
                  hasError={true}
                  walletAddress={searchedAddress} 
                />
              </div>
            </div>
            
            {/* Manual Token Entry removed as requested */}
          </div>
        </>
      )}
      
      {/* Empty state card hidden as requested */}
    </main>
  );
}