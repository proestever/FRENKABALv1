import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from "@/components/ui/switch";
import { Token } from '@shared/schema';
import { Search, ArrowDownUp, Eye, EyeOff, Wallet, History, PlusCircle } from 'lucide-react';
import { formatCurrency, formatCurrencyWithPrecision, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { getHiddenTokens, toggleHiddenToken, isTokenHidden } from '@/lib/api';
import { useBatchTokenLogos } from '@/hooks/use-batch-token-logos';
import { TransactionHistory } from '@/components/transaction-history';
import { ManualTokenEntry } from '@/components/manual-token-entry';
// Import PLS logo directly for consistent rendering
import plsLogo from '../assets/pls-logo-optimized.png';

interface TokenListProps {
  tokens: Token[];
  isLoading: boolean;
  hasError: boolean;
  walletAddress?: string; // Optional wallet address
}

type SortOption = 'value' | 'balance' | 'name' | 'price' | 'change';

export function TokenList({ tokens, isLoading, hasError, walletAddress }: TokenListProps) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenTokens, setHiddenTokens] = useState<string[]>(getHiddenTokens());
  const [showTransactions, setShowTransactions] = useState(false);
  const [txHistoryKey, setTxHistoryKey] = useState(Date.now());
  const [manualTokens, setManualTokens] = useState<Token[]>([]);
  const [showManualTokenEntry, setShowManualTokenEntry] = useState(false);

  // Extract token addresses and symbols for batch logo loading
  const tokenAddresses = useMemo(() => tokens.map(t => t.address), [tokens]);
  const tokenSymbols = useMemo(() => tokens.map(t => t.symbol), [tokens]);
  
  // Pre-fetch all token logos in a single batch request
  // This dramatically reduces API calls and speeds up initial loading
  const logoUrls = useBatchTokenLogos(tokenAddresses, tokenSymbols);

  // Handle toggling token visibility
  const handleToggleVisibility = (tokenAddress: string) => {
    const isNowHidden = toggleHiddenToken(tokenAddress);
    setHiddenTokens(getHiddenTokens());
  };

  // Filter tokens
  const filteredTokens = useMemo(() => {
    return tokens.filter(token => 
      // Text filter
      (token.name.toLowerCase().includes(filterText.toLowerCase()) || 
       token.symbol.toLowerCase().includes(filterText.toLowerCase())) &&
      // Hidden filter
      (showHidden || !hiddenTokens.includes(token.address))
    );
  }, [tokens, filterText, hiddenTokens, showHidden]);

  // Sort tokens
  const sortedTokens = useMemo(() => {
    return [...filteredTokens].sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return (b.value || 0) - (a.value || 0);
        case 'balance':
          return (b.balanceFormatted || 0) - (a.balanceFormatted || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price':
          return (b.price || 0) - (a.price || 0);
        case 'change':
          return (b.priceChange24h || 0) - (a.priceChange24h || 0);
        default:
          return 0;
      }
    });
  }, [filteredTokens, sortBy]);

  // Handle loading state
  if (isLoading) {
    return (
      <Card className="p-6 border-border shadow-lg backdrop-blur-sm bg-card/70">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary/60 rounded w-1/4"></div>
          <div className="h-10 bg-secondary/60 rounded w-full"></div>
          <div className="space-y-2">
            <div className="h-20 bg-secondary/60 rounded"></div>
            <div className="h-20 bg-secondary/60 rounded"></div>
            <div className="h-20 bg-secondary/60 rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

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

  // If no tokens
  if (tokens.length === 0) {
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
      <div className="p-6 border-b border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowTransactions(false)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 transition-all duration-200 
                ${!showTransactions 
                  ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                  : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
              title="View token holdings"
            >
              <Wallet size={18} />
              <span className="text-sm font-medium">Tokens</span>
            </button>
            <button
              onClick={() => {
                setShowTransactions(true);
                setTxHistoryKey(Date.now());
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 transition-all duration-200 
                ${showTransactions 
                  ? 'bg-black/30 text-white border-primary/50 shadow-[0_0_15px_rgba(0,120,255,0.5)] backdrop-blur-lg' 
                  : 'text-white/80 hover:bg-black/40 hover:border-white/30'}`}
              title="View transaction history"
            >
              <History size={18} />
              <span className="text-sm font-medium">Transactions</span>
            </button>
          </div>
          {!showTransactions && (
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
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
                className={`p-2 rounded-md glass-card hover:bg-black/20 border-white/15 ${showHidden ? 'text-purple-400' : 'text-white/70'}`}
                title={showHidden ? "Hide hidden tokens" : "Show hidden tokens"}
              >
                {showHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              
              <button
                onClick={() => setShowManualTokenEntry(!showManualTokenEntry)}
                className={`p-2 rounded-md glass-card hover:bg-black/20 border-white/15 ${showManualTokenEntry ? 'text-green-400' : 'text-white/70'}`}
                title={showManualTokenEntry ? "Hide token entry" : "Add token manually"}
              >
                <PlusCircle size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {showTransactions ? (
        <TransactionHistory 
          walletAddress={effectiveWalletAddress} 
          onClose={() => setShowTransactions(false)}
          key={`tx-${effectiveWalletAddress}-${txHistoryKey}`} // Force remount on toggle
        />
      ) : (
        <>
          {/* Mobile View - Only shown on small screens */}
          <div className="block md:hidden">
            <div className="space-y-2">
              {sortedTokens.map((token) => {
                const priceChangeClass = getChangeColorClass(token.priceChange24h);
                const isHidden = hiddenTokens.includes(token.address);
                
                return (
                  <div key={token.address} className="p-5 glass-card rounded-lg hover:bg-black/20 transition-colors">
                    <div className="flex items-center justify-between">
                      {/* Token Info */}
                      <div className="flex items-center flex-grow">
                        <div className="mr-4 flex-shrink-0">
                          {/* Force use our PLS logo for PLS token in mobile view too */}
                          {token.symbol === 'PLS' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? (
                            <img 
                              src={plsLogo} 
                              alt="PLS" 
                              className="w-10 h-10 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <TokenLogo 
                              address={token.address}
                              symbol={token.symbol}
                              fallbackLogo={token.logo}
                              size="lg"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-grow">
                          <div className="flex items-center gap-1">
                            <span className="text-base font-bold text-foreground" title={token.name}>
                              {token.name.length > 15 ? `${token.name.substring(0, 15)}...` : token.name}
                            </span>
                            {token.verified && (
                              <span className="text-green-400 flex-shrink-0" title="Verified Contract">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground font-medium">{token.symbol}</div>
                        </div>
                      </div>
                      
                      {/* Token Value & Hide Button */}
                      <div className="flex flex-col items-end">
                        <div className="text-base sm:text-lg font-bold mb-1 text-white">
                          {token.value !== undefined 
                            ? formatCurrency(token.value) 
                            : 'N/A'}
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className={`text-sm font-medium ${priceChangeClass}`}>
                            {token.priceChange24h !== undefined 
                              ? `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%` 
                              : ''}
                          </span>
                          <button 
                            onClick={() => handleToggleVisibility(token.address)}
                            className={`p-1.5 rounded-full glass-card hover:bg-black/20 ${isHidden ? 'text-white/60' : 'text-purple-400'}`}
                            title={isHidden ? "Show token" : "Hide token"}
                          >
                            {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Balance */}
                    <div className="mt-3 text-sm text-muted-foreground">
                      Balance: <span className="font-medium">{formatTokenAmount(token.balanceFormatted || 0)} {token.symbol}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Desktop View - Only shown on medium screens and up */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-black/20 backdrop-blur-md">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/5 first:rounded-tl-md">
                    Token
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                    Balance
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                    Price
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                    Value
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                    24h Change
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/12 last:rounded-tr-md">
                    Visibility
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedTokens.map((token) => {
                  const priceChangeClass = getAdvancedChangeClass(token.priceChange24h);
                  const isHidden = hiddenTokens.includes(token.address);
                  
                  return (
                    <tr key={token.address} className="hover:bg-black/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="mr-3 flex-shrink-0">
                            {/* Force use our PLS logo for PLS token */}
                          {token.symbol === 'PLS' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? (
                            <img 
                              src={plsLogo} 
                              alt="PLS" 
                              className="w-8 h-8 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <TokenLogo 
                              address={token.address}
                              symbol={token.symbol}
                              fallbackLogo={token.logo}
                            />
                          )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium text-foreground" title={token.name}>
                                {token.name.length > 15 ? `${token.name.substring(0, 15)}...` : token.name}
                              </span>
                              {token.verified && (
                                <span className="text-green-400 flex-shrink-0" title="Verified Contract">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="text-xs text-muted-foreground">{token.symbol}</div>
                              {token.exchange && (
                                <div className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-md border border-purple-500/30 flex-shrink-0">
                                  {token.exchange === "PancakeSwap v3" ? "9mm v3" : token.exchange}
                                </div>
                              )}
                              {token.securityScore && (
                                <div className={`text-xs px-1.5 py-0.5 rounded-md border flex-shrink-0 ${
                                  token.securityScore > 80 ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                  token.securityScore > 50 ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                                  'border-red-500/30 bg-red-500/10 text-red-400'
                                }`}>
                                  Score: {token.securityScore}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-white">{formatTokenAmount(token.balanceFormatted || 0)}</div>
                        <div className="text-xs text-muted-foreground">{token.symbol}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-white">
                          {token.price !== undefined 
                            ? formatCurrencyWithPrecision(token.price, 2, token.price < 0.01 ? 8 : 2) 
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-white">
                          {token.value !== undefined 
                            ? formatCurrency(token.value) 
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className={`text-sm font-medium ${priceChangeClass}`}>
                          {token.priceChange24h !== undefined 
                            ? `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%` 
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button 
                          onClick={() => handleToggleVisibility(token.address)}
                          className={`p-1.5 rounded-full glass-card hover:bg-black/20 ${isHidden ? 'text-white/60' : 'text-purple-400'}`}
                          title={isHidden ? "Show token" : "Hide token"}
                        >
                          {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Manual Token Entry */}
          {showManualTokenEntry && effectiveWalletAddress && (
            <div className="p-4 border-t border-white/10">
              <ManualTokenEntry 
                walletAddress={effectiveWalletAddress}
                onTokenAdded={(token) => {
                  // Add the token to our manual tokens list
                  setManualTokens(prev => {
                    // Check if token already exists
                    const exists = prev.some(t => t.address === token.address);
                    if (exists) {
                      // Update existing token
                      return prev.map(t => t.address === token.address ? token : t);
                    } else {
                      // Add new token
                      return [...prev, token];
                    }
                  });
                }}
              />
            </div>
          )}
          
          {/* Display manually added tokens if any */}
          {manualTokens.length > 0 && (
            <div className="px-6 py-3 border-t border-white/10 bg-green-500/5">
              <div className="text-green-400 text-sm font-medium mb-2 flex items-center">
                <PlusCircle size={14} className="mr-1" />
                Manually Added Tokens
              </div>
              <div className="space-y-2">
                {manualTokens.map(token => (
                  <div key={token.address} className="p-3 rounded-lg glass-card backdrop-blur-sm border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <TokenLogo
                        address={token.address}
                        symbol={token.symbol}
                        fallbackLogo={token.logo}
                      />
                      <div>
                        <div className="font-medium">{token.name} ({token.symbol})</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <span>{formatTokenAmount(token.balanceFormatted || 0)} {token.symbol}</span>
                          {token.price && (
                            <span className="text-green-400">
                              ≈ {formatCurrency((token.balanceFormatted || 0) * token.price)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="p-4 border-t border-white/10">
            <div className="text-muted-foreground text-sm flex justify-between items-center">
              <div>
                Showing {sortedTokens.length} token{sortedTokens.length !== 1 ? 's' : ''}
                {manualTokens.length > 0 && (
                  <span className="ml-1 text-green-400">+ {manualTokens.length} manual token{manualTokens.length !== 1 ? 's' : ''}</span>
                )}
              </div>
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
                      className="text-xs px-2 py-1 glass-card text-purple-400 rounded-md border-white/15 hover:bg-black/20"
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