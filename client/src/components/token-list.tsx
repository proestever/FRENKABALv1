import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from "@/components/ui/switch";
import { Token } from '@shared/schema';
import { Search, ArrowDownUp, Eye, EyeOff, Wallet, History, Droplets, GitCompareArrows } from 'lucide-react';
import { formatCurrency, formatCurrencyWithPrecision, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass } from '@/lib/utils';
import { formatTokenPrice } from '@/lib/format';
import { TokenLogo } from '@/components/token-logo';
import { LpTokenDisplay } from '@/components/lp-token-display';
import { getHiddenTokens, toggleHiddenToken, isTokenHidden } from '@/lib/api';
import { useBatchTokenLogos } from '@/hooks/use-batch-token-logos';
import { TransactionHistory } from '@/components/transaction-history';
import { TokenActionsMenu } from '@/components/token-actions-menu';
import { HexStakes } from '@/components/hex-stakes';

interface TokenListProps {
  tokens: Token[];
  isLoading: boolean;
  hasError: boolean;
  walletAddress?: string; // Optional wallet address
  otherWalletAddresses?: string[]; // Additional wallet addresses for multi-wallet mode
  isMultiWallet?: boolean; // Flag to indicate if we're in multi-wallet mode
  pagination?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
}

type SortOption = 'value' | 'balance' | 'name' | 'price' | 'change';

export function TokenList({ 
  tokens, 
  isLoading, 
  hasError, 
  walletAddress, 
  otherWalletAddresses = [], 
  isMultiWallet = false,
  pagination, 
  onPageChange 
}: TokenListProps) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenTokens, setHiddenTokens] = useState<string[]>(getHiddenTokens());
  const [showTransactions, setShowTransactions] = useState(false);
  const [showLiquidity, setShowLiquidity] = useState(false);
  const [showHexStakes, setShowHexStakes] = useState(false);
  const [txHistoryKey, setTxHistoryKey] = useState(Date.now());
  const [hexStakesKey, setHexStakesKey] = useState(Date.now());
  // NOTE: We don't maintain our own page state, we get it from pagination prop
  // and use onPageChange callback to request page changes from the parent

  // Extract token addresses and symbols for batch logo loading
  const tokenAddresses = useMemo(() => tokens.map(t => t.address), [tokens]);
  const tokenSymbols = useMemo(() => tokens.map(t => t.symbol), [tokens]);
  
  // Use a useState to store the logo URLs
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  
  // Use a single effect to load the logos using direct import
  useEffect(() => {
    // Dynamically import to avoid hook order issues
    import('@/hooks/use-batch-token-logos').then(module => {
      // Use the static helper function instead of the hook
      const batchLogos = module.getBatchTokenLogos(tokenAddresses);
      setLogoUrls(batchLogos);
    });
  }, [tokenAddresses]);

  // Handle toggling token visibility
  const handleToggleVisibility = (tokenAddress: string) => {
    const isNowHidden = toggleHiddenToken(tokenAddress);
    setHiddenTokens(getHiddenTokens());
  };

  // LP tokens only
  const lpTokens = useMemo(() => {
    return tokens.filter(token => token.isLp === true);
  }, [tokens]);
  
  // Filter tokens based on view and search
  const filteredTokens = useMemo(() => {
    // First apply the general filters
    const filtered = tokens.filter(token => 
      // Text filter
      (token.name.toLowerCase().includes(filterText.toLowerCase()) || 
       token.symbol.toLowerCase().includes(filterText.toLowerCase())) &&
      // Hidden filter
      (showHidden || !hiddenTokens.includes(token.address))
    );
    
    // Then apply the view-specific filter
    if (showLiquidity) {
      // Only return LP tokens when in liquidity view
      return filtered.filter(token => token.isLp === true);
    } else if (!showTransactions) {
      // In all tokens view, return all tokens
      return filtered;
    }
    
    return filtered;
  }, [tokens, filterText, hiddenTokens, showHidden, showLiquidity, showTransactions]);

  // Sort tokens
  const sortedTokens = useMemo(() => {
    // When pagination is active and using 'value' sort, preserve server's sort order
    // The server has already sorted ALL tokens by value before pagination
    if (pagination && sortBy === 'value') {
      return [...filteredTokens];
    }
    
    // For other sort criteria or when not paginating, do client-side sort
    return [...filteredTokens].sort((a, b) => {
      switch (sortBy) {
        case 'value':
          // Ensure proper number comparison with fallbacks for undefined values
          const aValue = typeof a.value === 'number' ? a.value : 0; 
          const bValue = typeof b.value === 'number' ? b.value : 0;
          return bValue - aValue;
        case 'balance':
          const aBalance = typeof a.balanceFormatted === 'number' ? a.balanceFormatted : 0;
          const bBalance = typeof b.balanceFormatted === 'number' ? b.balanceFormatted : 0;
          return bBalance - aBalance;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price':
          const aPrice = typeof a.price === 'number' ? a.price : 0;
          const bPrice = typeof b.price === 'number' ? b.price : 0;
          return bPrice - aPrice;
        case 'change':
          const aChange = typeof a.priceChange24h === 'number' ? a.priceChange24h : 0;
          const bChange = typeof b.priceChange24h === 'number' ? b.priceChange24h : 0;
          return bChange - aChange;
        default:
          return 0;
      }
    });
  }, [filteredTokens, sortBy, pagination]);

  // Skip loading state as we already have a progress bar at the top of the page
  // We'll let the parent component handle the loading state entirely

  // Handle error state
  if (hasError) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
        <div className="text-error text-6xl mb-4">
          <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Unable to load wallet data</h3>
        <p className="text-muted-foreground mb-4">There was an error retrieving the wallet information. Please check the address and try again.</p>
      </Card>
    );
  }

  // If no tokens and not loading, show empty state
  if (tokens.length === 0 && !isLoading) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">No tokens found</h3>
        <p className="text-muted-foreground">This wallet doesn't have any tokens or there was an issue retrieving them.</p>
      </Card>
    );
  }

  // Use prop wallet address or extract from token if needed
  const effectiveWalletAddress = walletAddress || (tokens.length > 0 ? tokens[0].address.split(':')[0] : '');

  return (
    <Card className="shadow-lg glass-card">
      {/* Tabs Container */}
      <div className="p-4 border-b border-border bg-black/20">
        <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-1">
          <button 
            onClick={() => {
              setShowTransactions(false);
              setShowLiquidity(false);
              setShowHexStakes(false);
            }}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-nowrap rounded-md glass-card border border-white/10 transition-all duration-200 
              ${!showTransactions && !showLiquidity && !showHexStakes
                ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
            title="View all token holdings"
          >
            <Wallet size={18} />
            <span className="text-sm font-medium">Tokens{!showLiquidity && !showTransactions && !showHexStakes ? ` (${sortedTokens.length})` : ''}</span>
          </button>
          
          <button 
            onClick={() => {
              setShowTransactions(false);
              setShowLiquidity(true);
              setShowHexStakes(false);
            }}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-nowrap rounded-md glass-card border border-white/10 transition-all duration-200 
              ${showLiquidity 
                ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
            title="View liquidity positions"
          >
            <Droplets size={18} />
            <span className="text-sm font-medium">Liquidity{lpTokens.length > 0 ? ` (${lpTokens.length})` : ''}</span>
          </button>
          
          <button
            onClick={() => {
              setShowTransactions(true);
              setShowLiquidity(false);
              setShowHexStakes(false);
              setTxHistoryKey(Date.now());
            }}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-nowrap rounded-md glass-card border border-white/10 transition-all duration-200 
              ${showTransactions 
                ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
            title="View transaction history"
          >
            <History size={18} />
            <span className="text-sm font-medium">Transactions</span>
          </button>
          
          <button
            onClick={() => {
              setShowTransactions(false);
              setShowLiquidity(false);
              setShowHexStakes(true);
              setHexStakesKey(Date.now());
            }}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 text-nowrap rounded-md glass-card border border-white/10 transition-all duration-200 
              ${showHexStakes 
                ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
            title="View HEX stakes"
          >
            <GitCompareArrows size={18} />
            <span className="text-sm font-medium">HEX Stakes</span>
          </button>
        </div>
      </div>
      
      {/* Filter and Sort Container */}
      <div className="p-4 border-b border-border">
        {!showTransactions && !showHexStakes && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            {/* Tokens or Liquidity Header */}
            {!showLiquidity && !showTransactions && !showHexStakes && (
              <div>
                <h3 className="text-lg md:text-xl font-semibold text-white flex items-center">
                  <Wallet size={18} className="mr-2 text-blue-300" />
                  <span>Tokens</span>
                  <span className="ml-2 text-sm md:text-md text-white/60">({sortedTokens.length})</span>
                </h3>
                <p className="text-xs md:text-sm text-white/70 mt-1">
                  All tokens in this wallet
                </p>
              </div>
            )}
            {showLiquidity && (
              <div>
                <h3 className="text-lg md:text-xl font-semibold text-white flex items-center">
                  <Droplets size={18} className="mr-2 text-sky-300" />
                  <span>Liquidity Positions</span>
                  <span className="ml-2 text-sm md:text-md text-white/60">({sortedTokens.length})</span>
                </h3>
                <p className="text-xs md:text-sm text-white/70 mt-1">
                  PulseX tokens representing your liquidity positions
                </p>
              </div>
            )}
            
            {/* Filter, Sort and Visibility Controls */}
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto justify-end">
              <div className="relative">
                <Input 
                  type="text" 
                  placeholder="Filter tokens..." 
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-8 w-full md:w-48 glass-card border-border/50 text-foreground bg-black/30"
                />
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              </div>
              
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortOption)}
              >
                <SelectTrigger className="w-full md:w-48 glass-card border-border/50 text-foreground bg-black/30">
                  <div className="flex items-center">
                    <span>Sort by: </span>
                    <SelectValue placeholder="Value" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-black/80 border-white/10 text-white backdrop-blur-md">
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="balance">Balance</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="change">24h Change</SelectItem>
                </SelectContent>
              </Select>
              
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`p-2 hover:opacity-80 transition-opacity ${showHidden ? 'text-purple-400' : 'text-white/70'}`}
                title={showHidden ? "Hide hidden tokens" : "Show hidden tokens"}
              >
                {showHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {showTransactions ? (
        <TransactionHistory 
          walletAddress={effectiveWalletAddress} 
          onClose={() => setShowTransactions(false)}
          key={`tx-${effectiveWalletAddress}-${txHistoryKey}`} // Force remount on toggle
        />
      ) : showHexStakes ? (
        <HexStakes 
          walletAddress={effectiveWalletAddress}
          otherWalletAddresses={isMultiWallet ? otherWalletAddresses : []}
          isMultiWallet={isMultiWallet}
          key={`hex-stakes-${effectiveWalletAddress}-${hexStakesKey}-${isMultiWallet}`} // Force remount on toggle
        />
      ) : (
        <>

          {/* Mobile View - Only shown on small screens */}
          <div className="block md:hidden">
            <div className="space-y-1">
              {sortedTokens.map((token, index) => {
                const priceChangeClass = getChangeColorClass(token.priceChange24h);
                const isHidden = hiddenTokens.includes(token.address);
                
                // If it's an LP token in liquidity view, render expanded
                if (token.isLp && showLiquidity) {
                  return (
                    <div key={`mobile-lp-${token.address}-${index}`} className="p-3 glass-card rounded-lg hover:bg-black/20 transition-colors">
                      <LpTokenDisplay 
                        token={token}
                        size="md"
                        showDetails={true}
                        expanded={true}
                      />
                    </div>
                  );
                }
                
                // Regular token view
                return (
                  <div key={`mobile-${token.address}-${index}`} className="p-3 glass-card rounded-lg hover:bg-black/20 transition-colors relative">
                    {/* Mobile Value and Visibility - Positioned center right of card */}
                    <div className="absolute top-1/2 right-3 transform -translate-y-1/2 md:hidden flex items-center gap-2">
                      <button 
                        onClick={() => handleToggleVisibility(token.address)}
                        className={`p-1 hover:opacity-80 transition-opacity ${isHidden ? 'text-white/40' : 'text-white/70'}`}
                        title={isHidden ? "Show token" : "Hide token"}
                      >
                        {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <div className="text-base font-bold text-white">
                        {token.value !== undefined 
                          ? formatCurrency(token.value) 
                          : 'N/A'}
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      {/* Token Info - Mobile: Side by side logo and info layout */}
                      <div className="flex md:flex-row md:items-center flex-grow pr-20">
                        {/* Logo aligned with text on mobile */}
                        <div className="flex-shrink-0 flex items-center mr-3">
                          {token.isLp ? (
                            <LpTokenDisplay 
                              token={token}
                              size="md"
                              showDetails={false}
                              expanded={false}
                            />
                          ) : (
                            <TokenLogo 
                              address={token.address}
                              symbol={token.symbol}
                              fallbackLogo={token.logo}
                              size="md"
                            />
                          )}
                        </div>
                        
                        <div className="min-w-0 flex-grow text-left flex flex-col justify-center">
                          <div className="flex items-center gap-1 justify-start">
                            {token.isLp && token.lpToken0Symbol && token.lpToken1Symbol ? (
                              <span className="text-base font-bold text-foreground" title={token.name}>
                                <span className="flex items-center">
                                  {token.lpToken0Symbol}/{token.lpToken1Symbol} <span className="ml-1 text-xs bg-purple-600/30 text-purple-100 px-1 py-0.5 rounded-md border border-purple-500/60 scale-[0.65] inline-block transform-gpu origin-center font-semibold">LP</span>
                                </span>
                              </span>
                            ) : (
                              <TokenActionsMenu 
                                tokenAddress={token.address} 
                                tokenName={token.name} 
                                tokenSymbol={token.symbol}
                              >
                                <div className="cursor-pointer text-base font-bold text-foreground hover:text-gray-300 transition-colors">
                                  <span title={token.name}>
                                    {token.name.length > 15 ? `${token.name.substring(0, 15)}...` : token.name}
                                  </span>
                                </div>
                              </TokenActionsMenu>
                            )}
                            {token.verified && (
                              <span className="text-green-400 flex-shrink-0" title="Verified Contract">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 items-center justify-start">
                            <div className="text-sm text-muted-foreground font-medium" title={token.symbol}>
                              {token.symbol.length > 15 ? `${token.symbol.substring(0, 15)}...` : token.symbol}
                            </div>
                            <div className="text-xs text-gray-400">
                              • {formatTokenAmount(token.balanceFormatted || 0)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 justify-start">
                            <div className="text-xs text-white font-medium">
                              {token.price !== undefined 
                                ? formatTokenPrice(token.price) 
                                : ''}
                            </div>
                            <span className={`text-xs font-medium ${priceChangeClass}`}>
                              {token.priceChange24h !== undefined 
                                ? `(${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%)` 
                                : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Token Value - Desktop Only */}
                      <div className="hidden md:flex flex-col items-end">
                        <div className="text-base font-bold text-white">
                          {token.value !== undefined 
                            ? formatCurrency(token.value) 
                            : 'N/A'}
                        </div>
                        <div className="flex gap-2 items-center mt-1">
                          <button 
                            onClick={() => handleToggleVisibility(token.address)}
                            className={`p-1.5 hover:opacity-80 transition-opacity ${isHidden ? 'text-white/40' : 'text-white/70'}`}
                            title={isHidden ? "Show token" : "Hide token"}
                          >
                            {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Empty state for Liquidity tab */}
          {showLiquidity && sortedTokens.length === 0 && !isLoading && (
            <div className="p-8 text-center">
              <div className="inline-flex p-4 rounded-full bg-sky-300/10 text-sky-300 mb-4">
                <Droplets size={32} />
              </div>
              <h3 className="text-lg md:text-xl font-bold mb-2">No Liquidity Positions Found</h3>
              <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
                This wallet doesn't have any PulseX tokens. These tokens represent liquidity positions on PulseX.
              </p>
            </div>
          )}
          
          {/* Desktop View - Only shown on medium screens and up */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-black/20 backdrop-blur-md">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/5 first:rounded-tl-md">
                    Token
                  </th>
                  {!showLiquidity && (
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/6">
                      Balance
                    </th>
                  )}
                  {!showLiquidity && (
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/5">
                      Price (24h)
                    </th>
                  )}
                  {!showLiquidity && (
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/6">
                      Value
                    </th>
                  )}
                  <th scope="col" className="hidden px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/12">
                    {/* Hidden column */}
                  </th>
                  {!showLiquidity && (
                    <th scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-1/12 last:rounded-tr-md">
                      Visibility
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedTokens.map((token, index) => {
                  const priceChangeClass = getAdvancedChangeClass(token.priceChange24h);
                  const isHidden = hiddenTokens.includes(token.address);
                  
                  // Create a unique key using address and index to avoid duplicate keys
                  return (
                    <tr key={`desktop-${token.address}-${index}`} className="hover:bg-black/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          {token.isLp && showLiquidity ? (
                            <div className="w-full">
                              <LpTokenDisplay 
                                token={token}
                                size="md"
                                showDetails={showLiquidity}
                                expanded={showLiquidity}
                              />
                            </div>
                          ) : (
                            <div className="mr-3 flex-shrink-0">
                              {token.isLp ? (
                                <LpTokenDisplay 
                                  token={token}
                                  size="md"
                                  showDetails={false}
                                  expanded={false}
                                />
                              ) : (
                                <TokenLogo 
                                  address={token.address}
                                  symbol={token.symbol}
                                  fallbackLogo={token.logo}
                                  size="md"
                                />
                              )}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1">
                              {token.isLp && token.lpToken0Symbol && token.lpToken1Symbol ? (
                                <span className="text-base font-bold text-foreground" title={token.name}>
                                  <span></span>
                                </span>
                              ) : (
                                <TokenActionsMenu 
                                  tokenAddress={token.address} 
                                  tokenName={token.name} 
                                  tokenSymbol={token.symbol}
                                >
                                  <div className="cursor-pointer text-base font-bold text-foreground hover:text-gray-300 transition-colors">
                                    <span title={token.name}>
                                      {token.name.length > 15 ? `${token.name.substring(0, 15)}...` : token.name}
                                    </span>
                                  </div>
                                </TokenActionsMenu>
                              )}
                              {token.verified && (
                                <span className="text-green-400 flex-shrink-0" title="Verified Contract">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 overflow-hidden">
                              {!token.isLp && (
                                <div className="text-sm text-muted-foreground" title={token.symbol}>
                                  {token.symbol.length > 15 ? `${token.symbol.substring(0, 15)}...` : token.symbol}
                                </div>
                              )}
                              {token.exchange && (
                                <div className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-md border border-purple-500/30 flex-shrink-0">
                                  {token.exchange === "PancakeSwap v3" ? "9mm v3" : token.exchange}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {!showLiquidity && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-base font-bold text-white">{formatTokenAmount(token.balanceFormatted || 0)}</div>
                          {!token.isLp && (
                            <div className="text-sm text-muted-foreground" title={token.symbol}>
                              {token.symbol.length > 15 ? `${token.symbol.substring(0, 15)}...` : token.symbol}
                            </div>
                          )}
                        </td>
                      )}
                      {!showLiquidity && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex flex-col items-end">
                            <div className="text-base font-bold text-white">
                              {token.price !== undefined 
                                ? formatTokenPrice(token.price) 
                                : 'N/A'}
                            </div>
                            <div className={`text-sm font-medium ${priceChangeClass}`}>
                              {token.priceChange24h !== undefined 
                                ? `(${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%)` 
                                : ''}
                            </div>
                          </div>
                        </td>
                      )}
                      {!showLiquidity && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-base font-bold text-white">
                            {token.value !== undefined 
                              ? formatCurrency(token.value) 
                              : 'N/A'}
                          </div>
                        </td>
                      )}
                      <td className="hidden px-4 py-3 whitespace-nowrap text-right">
                        {/* Column hidden but kept for structure */}
                      </td>
                      {!showLiquidity && (
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <button 
                            onClick={() => handleToggleVisibility(token.address)} 
                            className={`p-1.5 hover:opacity-80 transition-opacity ${isHidden ? 'text-white/40' : 'text-white/70'}`}
                            title={isHidden ? "Show token" : "Hide token"}
                          >
                            {isHidden ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t border-white/10">
            <div className="text-muted-foreground text-sm flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                Showing {sortedTokens.length} token{sortedTokens.length !== 1 ? 's' : ''}
              </div>
              
              {/* Pagination Controls Removed - Now loading all tokens at once */}
              
              {hiddenTokens.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${showHidden ? 'text-purple-400' : 'text-muted-foreground'}`}>
                    {showHidden 
                      ? 'Showing hidden tokens' 
                      : `${hiddenTokens.length} hidden token${hiddenTokens.length !== 1 ? 's' : ''}`
                    }
                  </span>
                  {!showHidden && (
                    <button 
                      onClick={() => setShowHidden(true)}
                      className="text-xs px-2 py-1 text-white/70 hover:opacity-80 transition-opacity"
                    >
                      Show
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}