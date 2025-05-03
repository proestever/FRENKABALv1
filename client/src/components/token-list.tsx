import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { Token } from '@shared/schema';
import { Search, ArrowDownUp } from 'lucide-react';
import { formatCurrency, formatCurrencyWithPrecision, formatTokenAmount, getChangeColorClass } from '@/lib/utils';

interface TokenListProps {
  tokens: Token[];
  isLoading: boolean;
  hasError: boolean;
}

type SortOption = 'value' | 'balance' | 'name' | 'price' | 'change';

export function TokenList({ tokens, isLoading, hasError }: TokenListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const itemsPerPage = 5;

  // Filter tokens
  const filteredTokens = useMemo(() => {
    return tokens.filter(token => 
      token.name.toLowerCase().includes(filterText.toLowerCase()) || 
      token.symbol.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [tokens, filterText]);

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

  // Paginate tokens
  const totalPages = Math.ceil(sortedTokens.length / itemsPerPage);
  const paginatedTokens = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedTokens.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedTokens, currentPage]);

  // Handle loading state
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary-200 rounded w-1/4"></div>
          <div className="h-10 bg-secondary-200 rounded w-full"></div>
          <div className="space-y-2">
            <div className="h-20 bg-secondary-200 rounded"></div>
            <div className="h-20 bg-secondary-200 rounded"></div>
            <div className="h-20 bg-secondary-200 rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

  // Handle error state
  if (hasError) {
    return (
      <Card className="p-6 text-center">
        <div className="text-error text-6xl mb-4">
          <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2">Unable to load wallet data</h3>
        <p className="text-secondary-600 mb-4">There was an error retrieving the wallet information. Please check the address and try again.</p>
      </Card>
    );
  }

  // If no tokens
  if (tokens.length === 0) {
    return (
      <Card className="p-6 text-center">
        <h3 className="text-xl font-bold mb-2">No tokens found</h3>
        <p className="text-secondary-600">This wallet doesn't have any tokens or there was an issue retrieving them.</p>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <div className="p-6 border-b border-secondary-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-bold">Token Holdings</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative">
              <Input 
                type="text" 
                placeholder="Filter tokens..." 
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-8 w-full md:w-48"
              />
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-secondary-400" />
            </div>
            
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
            >
              <SelectTrigger className="w-full md:w-48">
                <div className="flex items-center">
                  <span>Sort by: </span>
                  <SelectValue placeholder="Value" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="change">24h Change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-secondary-200">
          <thead className="bg-secondary-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                Token
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-secondary-500 uppercase tracking-wider">
                Balance
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-secondary-500 uppercase tracking-wider">
                Price
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-secondary-500 uppercase tracking-wider">
                Value
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-secondary-500 uppercase tracking-wider">
                24h Change
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-secondary-200">
            {paginatedTokens.map((token) => {
              const priceChangeClass = getChangeColorClass(token.priceChange24h);
              
              return (
                <tr key={token.address} className="hover:bg-secondary-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <img 
                        src={token.logo || 'https://cryptologos.cc/logos/placeholder-logo.png'} 
                        alt={token.symbol} 
                        className="w-8 h-8 mr-3 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://cryptologos.cc/logos/placeholder-logo.png';
                        }}
                      />
                      <div>
                        <div className="text-sm font-medium">{token.name}</div>
                        <div className="text-xs text-secondary-500">{token.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium">{formatTokenAmount(token.balanceFormatted || 0)}</div>
                    <div className="text-xs text-secondary-500">{token.symbol}</div>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="p-4 border-t border-secondary-200 flex justify-between items-center">
          <div className="text-secondary-500 text-sm">
            Showing {paginatedTokens.length} of {sortedTokens.length} tokens
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </Card>
  );
}
