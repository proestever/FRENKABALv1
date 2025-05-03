import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from "@/components/ui/switch";
import { Token } from '@shared/schema';
import { Search, ArrowDownUp, Eye, EyeOff } from 'lucide-react';
import { formatCurrency, formatCurrencyWithPrecision, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { getHiddenTokens, toggleHiddenToken, isTokenHidden } from '@/lib/api';

interface TokenListProps {
  tokens: Token[];
  isLoading: boolean;
  hasError: boolean;
}

type SortOption = 'value' | 'balance' | 'name' | 'price' | 'change';

export function TokenList({ tokens, isLoading, hasError }: TokenListProps) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenTokens, setHiddenTokens] = useState<string[]>(getHiddenTokens());

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

  return (
    <Card className="shadow-lg border-border backdrop-blur-sm bg-card/70">
      <div className="p-6 border-b border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Token Holdings
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative">
              <Input 
                type="text" 
                placeholder="Filter tokens..." 
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-8 w-full md:w-48 bg-secondary border-border text-foreground"
              />
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            </div>
            
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
            >
              <SelectTrigger className="w-full md:w-48 bg-secondary border-border text-foreground">
                <div className="flex items-center">
                  <span>Sort by: </span>
                  <SelectValue placeholder="Value" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="change">24h Change</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-border bg-secondary">
              <div className="flex items-center text-sm gap-2">
                <div className="text-purple-400">
                  {showHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </div>
                <span>{showHidden ? "Show Hidden" : "Hide Hidden"}</span>
              </div>
              <Switch
                checked={showHidden}
                onCheckedChange={setShowHidden}
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Token
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Balance
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Price
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Value
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                24h Change
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Visibility
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTokens.map((token) => {
              const priceChangeClass = getAdvancedChangeClass(token.priceChange24h);
              const isHidden = hiddenTokens.includes(token.address);
              
              return (
                <tr key={token.address} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="mr-3">
                        <TokenLogo 
                          address={token.address}
                          symbol={token.symbol}
                          fallbackLogo={token.logo}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium text-foreground">{token.name}</span>
                          {token.verified && (
                            <span className="text-green-400" title="Verified Contract">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">{token.symbol}</div>
                          {token.exchange && (
                            <div className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-md border border-purple-500/30">
                              {token.exchange}
                            </div>
                          )}
                          {token.securityScore && (
                            <div className={`text-xs px-1.5 py-0.5 rounded-md border ${
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
                    <div className="text-sm font-medium">{formatTokenAmount(token.balanceFormatted || 0)}</div>
                    <div className="text-xs text-muted-foreground">{token.symbol}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium">
                      {token.price !== undefined 
                        ? formatCurrencyWithPrecision(token.price, 2, token.price < 0.01 ? 8 : 2) 
                        : 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium">
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
                      className={`p-1.5 rounded-full hover:bg-secondary ${isHidden ? 'text-muted-foreground' : 'text-purple-400'}`}
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
      
      <div className="p-4 border-t border-border">
        <div className="text-muted-foreground text-sm flex justify-between items-center">
          <div>
            Showing {sortedTokens.length} token{sortedTokens.length !== 1 ? 's' : ''}
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
                  className="text-xs px-2 py-1 bg-purple-500/10 text-purple-400 rounded-md border border-purple-500/30 hover:bg-purple-500/20"
                >
                  Show
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
