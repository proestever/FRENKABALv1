import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { SearchSection } from '@/components/search-section';
import { WalletOverview } from '@/components/wallet-overview';
import { TokenList } from '@/components/token-list';
import { TokenLogo } from '@/components/token-logo';
import { EmptyState } from '@/components/empty-state';
import { LoadingProgress } from '@/components/loading-progress';
import { ManualTokenEntry } from '@/components/manual-token-entry';


import ApiStats from '@/components/api-stats';
import { Button } from '@/components/ui/button';
import { saveRecentAddress, ProcessedToken, fetchWalletData, fetchAllWalletTokens, forceRefreshWalletData } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAllWalletTokens } from '@/hooks/use-all-wallet-tokens'; // New hook for loading all tokens
import { useClientSideWallet } from '@/hooks/use-client-side-wallet'; // Client-side wallet hook
import { useDirectBalance } from '@/hooks/use-direct-balance';
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
  const params = useParams<{ walletAddress?: string; portfolioId?: string; publicCode?: string }>();
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
      queryClient.invalidateQueries({ queryKey: [`client-wallet-${searchedAddress}`] });
    }
    
    // Always invalidate the new wallet's cache to ensure fresh data
    queryClient.invalidateQueries({ queryKey: [`client-wallet-${address}`] });
    queryClient.removeQueries({ queryKey: [`client-wallet-${address}`] }); // Force remove from cache
    
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
    
    // Only update URL if we're not already on a portfolio URL
    // This preserves the /p/{code} URL when loading portfolio bundles
    if (!location.startsWith('/p/') && !location.startsWith('/portfolio/')) {
      // Update URL to show we're in multi-wallet mode
      const firstAddress = addresses[0];
      const currentPath = `/${firstAddress}`;
      if (location !== currentPath) {
        setLocation(currentPath);
      }
    }
    
    // Save the first address to recent addresses
    saveRecentAddress(addresses[0]);
    
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
      
      // Parallelize all data fetching for maximum speed
      setMultiWalletProgress({
        currentBatch: addresses.length,
        totalBatches: addresses.length,
        status: 'loading',
        message: `Loading ${addresses.length} wallets and HEX stakes in parallel...`
      });
      
      // Start ALL async operations but load wallets one by one to avoid timeouts
      const [walletResults, hexStakesData, individualHexResults] = await Promise.all([
        // Fetch wallet data one by one sequentially
        (async () => {
          const results = [];
          const DELAY_BETWEEN_WALLETS = 1000; // 1 second delay between each wallet
          
          for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            
            // Update progress
            setMultiWalletProgress({
              currentBatch: i + 1,
              totalBatches: addresses.length,
              status: 'loading',
              message: `Loading wallet ${i + 1} of ${addresses.length}...`
            });
            
            // Add delay between wallets (except for the first wallet)
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_WALLETS));
            }
            
            try {
              // Fetch wallet data with smart contract prices
              const { fetchWalletDataWithContractPrices } = await import('@/services/wallet-client-service');
              const dataWithPrices = await fetchWalletDataWithContractPrices(address);
              
              // Check if wallet had an error
              if (dataWithPrices.error) {
                console.warn(`Wallet ${address} loaded with error: ${dataWithPrices.error}`);
              } else {
                console.log(`Successfully fetched wallet ${address}:`, {
                  tokenCount: dataWithPrices.tokens.length,
                  totalValue: dataWithPrices.totalValue,
                  lpCount: dataWithPrices.tokens.filter((t: any) => t.isLp).length
                });
              }
              
              results.push({ [address]: dataWithPrices });
            } catch (error) {
              console.error(`Error fetching wallet ${address}:`, error);
              // Return wallet data with error flag instead of empty data
              results.push({ 
                [address]: {
                  address,
                  tokens: [],
                  totalValue: 0,
                  tokenCount: 0,
                  plsBalance: 0,
                  networkCount: 1,
                  error: error instanceof Error ? error.message : 'Failed to fetch wallet data'
                }
              });
            }
            
            // Update progress percentage
            const progress = Math.round((i + 1) / addresses.length * 100);
            setMultiWalletProgress({
              currentBatch: i + 1,
              totalBatches: addresses.length,
              status: 'loading',
              message: `Loading wallets... (${i + 1}/${addresses.length})`
            });
          }
          
          return results;
        })(),
        // Fetch combined HEX stakes data
        fetchCombinedHexStakes(addresses).catch(error => {
          console.error('Error fetching combined HEX stakes:', error);
          return null;
        }),
        // Fetch individual HEX stakes data for each wallet in parallel
        Promise.all(
          addresses.map(address => 
            fetchHexStakesSummary(address)
              .then(data => ({ [address]: data }))
              .catch(error => {
                console.error(`Error fetching HEX stakes for ${address}:`, error);
                return null;
              })
          )
        )
      ]);
      
      // Process individual HEX stakes data
      const individualHexData = individualHexResults
        .filter(result => result !== null)
        .reduce((acc, result) => ({ ...acc, ...result }), {});
      
      // Store individual wallet HEX stakes data
      setIndividualWalletHexStakes(individualHexData);
      
      // Filter out null results and combine into a single object
      const walletData = walletResults
        .filter(result => result !== null)
        .reduce((acc: any, result: any) => ({ ...acc, ...result }), {});
      
      // Log summary of fetched data
      console.log('Portfolio fetch summary:', {
        totalWallets: addresses.length,
        successfulWallets: Object.keys(walletData).length,
        failedWallets: addresses.length - Object.keys(walletData).length,
        walletDetails: Object.entries(walletData).map(([addr, data]) => ({
          address: addr,
          tokenCount: data.tokens?.length || 0,
          lpCount: data.tokens?.filter(t => t.isLp).length || 0,
          value: data.totalValue || 0
        }))
      });
      
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
      // Only search if this is a different address than what we're currently showing
      if (searchedAddress !== params.walletAddress) {
        console.log(`Detected wallet address in URL params: ${params.walletAddress}`);
        handleSearch(params.walletAddress);
      }
      return;
    }
    
    // Check if we have a public portfolio code (/p/:publicCode)
    if (params.publicCode) {
      console.log(`Loading portfolio with public code: ${params.publicCode}`);
      
      const fetchPortfolioByCode = async () => {
        try {
          // Fetch portfolio by public code
          const portfolioResponse = await fetch(`/api/portfolios/public/${params.publicCode}`);
          if (!portfolioResponse.ok) {
            throw new Error('Portfolio not found');
          }
          const portfolio = await portfolioResponse.json();
          
          // Then fetch the wallet addresses
          const addressesResponse = await fetch(`/api/portfolios/${portfolio.id}/addresses`);
          const addresses = await addressesResponse.json();
          
          if (addresses && addresses.length > 0) {
            setPortfolioName(portfolio.name);
            setPortfolioUrlId(params.publicCode || null);
            console.log(`Portfolio name: ${portfolio.name}`);
            
            // Filter out any invalid addresses and get wallet addresses
            const validAddresses = addresses
              .map((addr: any) => addr.walletAddress)
              .filter((addr: string) => addr.startsWith('0x'));
              
            if (validAddresses.length > 0) {
              handleMultiSearch(validAddresses);
            }
          }
        } catch (error) {
          console.error('Error loading portfolio by public code:', error);
          toast({
            title: "Portfolio not found",
            description: "The portfolio code is invalid or the portfolio does not exist.",
            variant: "destructive"
          });
        }
      };
      
      fetchPortfolioByCode();
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
          // Check if portfolioId is numeric (ID) or not (slug)
          const isNumericId = /^\d+$/.test(portfolioId);
          
          let portfolioData;
          if (isNumericId) {
            // Fetch by ID
            const response = await fetch(`/api/portfolios/${portfolioId}/wallet-addresses`);
            portfolioData = await response.json();
          } else {
            // Fetch by slug - first get the portfolio details
            const portfolioResponse = await fetch(`/api/portfolios/slug/${portfolioId}`);
            if (!portfolioResponse.ok) {
              throw new Error('Portfolio not found');
            }
            const portfolio = await portfolioResponse.json();
            
            // Then fetch the wallet addresses
            const addressesResponse = await fetch(`/api/portfolios/slug/${portfolioId}/addresses`);
            const addresses = await addressesResponse.json();
            
            portfolioData = {
              portfolioName: portfolio.name,
              walletAddresses: addresses.map((addr: any) => addr.walletAddress)
            };
          }
          
          if (portfolioData && portfolioData.walletAddresses && portfolioData.walletAddresses.length > 0) {
            setPortfolioName(portfolioData.portfolioName);
            console.log(`Portfolio name from API: ${portfolioData.portfolioName}`);
            
            // Filter out any invalid addresses
            const validAddresses = portfolioData.walletAddresses.filter((addr: string) => addr.startsWith('0x'));
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

  // Use client-side wallet hook to avoid server rate limits
  const {
    walletData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    progress
  } = useClientSideWallet(searchedAddress)
  
  // Fetch HEX stakes for single wallet
  const [singleWalletHexStakes, setSingleWalletHexStakes] = useState<HexStakeSummary | null>(null);
  
  useEffect(() => {
    if (searchedAddress && !multiWalletData) {
      // Fetch HEX stakes for single wallet
      fetchHexStakesSummary(searchedAddress)
        .then(hexData => {
          console.log(`Fetched HEX stakes for single wallet ${searchedAddress}:`, hexData);
          setSingleWalletHexStakes(hexData);
        })
        .catch(err => {
          console.error('Error fetching HEX stakes for single wallet:', err);
          setSingleWalletHexStakes(null);
        });
    }
  }, [searchedAddress, multiWalletData]);
  
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
  const allTokens = (() => {
    if (!walletData) return manualTokens;
    
    // Start with wallet tokens
    let tokens = [...walletData.tokens];
    
    // Add native PLS as a virtual token if it has value
    if (walletData.plsBalance && walletData.plsBalance > 0) {
      // Get WPLS price from tokens
      const wplsToken = walletData.tokens.find((t: any) => 
        t.address.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
      );
      const plsPrice = wplsToken?.price || 0;
      const plsPriceChange24h = wplsToken?.priceChange24h || 0;
      
      const plsToken = {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Native PLS address convention
        symbol: 'PLS',
        name: 'PulseChain',
        balance: walletData.plsBalance.toString(),
        value: walletData.plsBalance * plsPrice,
        price: plsPrice,
        priceChange24h: plsPriceChange24h,
        balanceFormatted: walletData.plsBalance,
        decimals: 18,
        logo: '', // Will be handled by TokenLogo component
        isLp: false,
        isNative: true
      };
      
      // Add PLS to the beginning of the token list
      tokens.unshift(plsToken);
    }
    
    // Add manual tokens that aren't already in the list
    const manualTokensToAdd = manualTokens.filter(t => 
      !tokens.some((wt: { address: string }) => wt.address.toLowerCase() === t.address.toLowerCase())
    );
    
    return [...tokens, ...manualTokensToAdd];
  })();

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
        walletAddress={searchedAddress || (multiWalletData ? 'Multiple wallets' : undefined)}
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
                {/* Left column - Combined Wallet Overview (desktop only) */}
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
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
                  
                  {/* Show individual wallet cards below the main overview on desktop only */}
                  <div className="hidden lg:block glass-card p-4 border border-white/20 rounded-md">
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
                        
                        // Get top 3 tokens for this wallet
                        const top3Tokens = wallet.tokens
                          .sort((a, b) => (b.value || 0) - (a.value || 0))
                          .slice(0, 3);
                        
                        const walletWithError = wallet as any;
                        
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
                            
                            {walletWithError.error ? (
                              // Show error state for failed wallets
                              <div className="text-xs text-red-400 mb-2">
                                <span>⚠️ Failed to load: {walletWithError.error}</span>
                              </div>
                            ) : (
                              <>
                                <div className="text-xs mb-1">
                                  <span className="opacity-70">Value (with HEX Stakes):</span>{' '}
                                  ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  {hexStakeValue > 0 && (
                                    <span className="text-xs text-purple-300 ml-1">
                                      (includes ${hexStakeValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} in HEX stakes)
                                    </span>
                                  )}
                                </div>
                                
                                <div className="text-xs mb-2">
                                  <span className="opacity-70">Tokens:</span>{' '}
                                  {wallet.tokenCount}
                                  {walletHexStakes && walletHexStakes.stakeCount > 0 && (
                                    <span className="text-purple-300 ml-2">
                                      + {walletHexStakes.stakeCount} HEX {walletHexStakes.stakeCount === 1 ? 'stake' : 'stakes'}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                            
                            {/* Top 3 tokens */}
                            {top3Tokens.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/5">
                                <div className="text-xs opacity-70 mb-1">Top Tokens:</div>
                                <div className="space-y-1">
                                  {top3Tokens.map((token, index) => (
                                    <div key={token.address} className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-white/50">{index + 1}.</span>
                                        <TokenLogo 
                                          address={token.address} 
                                          symbol={token.symbol} 
                                          size="xs" 
                                        />
                                        <span className="font-medium">{token.symbol}</span>
                                      </div>
                                      <span className="text-white/70">
                                        ${(token.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
                  
                  {/* Show individual wallet cards below tokens on mobile only */}
                  <div className="block lg:hidden mt-6 glass-card p-4 border border-white/20 rounded-md">
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
                        }
                        
                        // Get top 3 tokens for this wallet
                        const top3Tokens = wallet.tokens
                          .sort((a, b) => (b.value || 0) - (a.value || 0))
                          .slice(0, 3);
                        
                        const walletWithError = wallet as any;
                        
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
                            
                            {walletWithError.error ? (
                              // Show error state for failed wallets
                              <div className="text-xs text-red-400 mb-2">
                                <span>⚠️ Failed to load: {walletWithError.error}</span>
                              </div>
                            ) : (
                              <>
                                <div className="text-xs mb-2">
                                  <span className="opacity-70">Value:</span>{' '}
                                  ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                
                                <div className="text-xs mb-2">
                                  <span className="opacity-70">Tokens:</span>{' '}
                                  {wallet.tokenCount}
                                  {walletHexStakes && walletHexStakes.stakeCount > 0 && (
                                    <span className="text-purple-300 ml-2">
                                      + {walletHexStakes.stakeCount} HEX {walletHexStakes.stakeCount === 1 ? 'stake' : 'stakes'}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                            
                            {/* Top 3 tokens */}
                            {top3Tokens.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/5">
                                <div className="text-xs opacity-70 mb-1">Top Tokens:</div>
                                <div className="space-y-1">
                                  {top3Tokens.map((token, index) => (
                                    <div key={token.address} className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-white/50">{index + 1}.</span>
                                        <TokenLogo 
                                          address={token.address} 
                                          symbol={token.symbol} 
                                          size="xs" 
                                        />
                                        <span className="font-medium">{token.symbol}</span>
                                      </div>
                                      <span className="text-white/70">
                                        ${(token.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                    hexStakesSummary={singleWalletHexStakes}
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