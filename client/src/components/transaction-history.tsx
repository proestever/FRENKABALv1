import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw, Filter, Plus, Copy, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { formatDate, shortenAddress } from '@/lib/utils';
import { Link } from 'wouter';
import { useTokenDataPrefetch } from '@/hooks/use-token-data-prefetch';
import { useBatchTokenPrices } from '@/hooks/use-batch-token-prices';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Import Transaction types
import { Transaction, TransactionTransfer } from '@/lib/api';

// Define transaction type options
type TransactionType = 'all' | 'swap' | 'send' | 'receive' | 'approval' | 'contract';

// Common DEX router addresses on PulseChain (lowercase)
const DEX_ROUTERS = [
  '0x165c3410fbed4528472e9e0d4d1c8d8cbd0723dd', // PulseX router
  '0x29ea298fefa2efd3213a1ad637a41b9a640a1e9d', // PulseX V2 router
  '0x98bf93ebf5c380c0e6ae8e192a7e2ae08edacc02', // HEX/USD PulseX pool
  '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc', // Uniswap V2 (and forks) common routers
];

// Known approval method signatures
const APPROVAL_METHODS = [
  'approve',
  'increaseAllowance',
  'decreaseAllowance',
  'setApprovalForAll'
];

// Helper function to determine transaction type
const getTransactionType = (tx: Transaction): TransactionType => {
  // Check if this is an ERC20 approval transaction
  if (
    tx.method_label?.toLowerCase().includes('approve') || 
    (APPROVAL_METHODS.some(method => tx.method_label?.toLowerCase().includes(method)))
  ) {
    return 'approval';
  }
  
  // Check for DEX swaps by router addresses (more accurate than method inference)
  if (tx.to_address && DEX_ROUTERS.includes(tx.to_address.toLowerCase())) {
    return 'swap';
  }
  
  // Check if this is a token swap by looking for multiple token transfers
  if (tx.erc20_transfers && tx.erc20_transfers.length >= 2) {
    // Look for patterns where tokens are sent and received in the same transaction
    const sentTokens = tx.erc20_transfers.filter(t => 
      t.from_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    const receivedTokens = tx.erc20_transfers.filter(t => 
      t.to_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    if (sentTokens.length > 0 && receivedTokens.length > 0) {
      return 'swap';
    }
  }
  
  // If category is provided, use it for additional classification
  if (tx.category) {
    const category = tx.category.toLowerCase();
    
    if (category.includes('swap') || category.includes('trade')) {
      return 'swap';
    } else if (category.includes('approve') || category.includes('approval')) {
      return 'approval';
    } else if (category.includes('receive')) {
      return 'receive';
    } else if (category.includes('send') || category.includes('transfer')) {
      return 'send';
    } else if (category.includes('contract') || category.includes('deploy') || category.includes('execute')) {
      return 'contract';
    }
  }
  
  // Determine direction based on transfers
  if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
    // Check if all transfers are outgoing
    const allOutgoing = tx.erc20_transfers.every(t => 
      t.from_address.toLowerCase() === tx.from_address.toLowerCase() && 
      t.to_address.toLowerCase() !== tx.from_address.toLowerCase()
    );
    
    if (allOutgoing) return 'send';
    
    // Check if all transfers are incoming
    const allIncoming = tx.erc20_transfers.every(t => 
      t.to_address.toLowerCase() === tx.from_address.toLowerCase() && 
      t.from_address.toLowerCase() !== tx.from_address.toLowerCase()
    );
    
    if (allIncoming) return 'receive';
  }
  
  // Default for unclassified transactions
  return 'all';
};

interface TransactionHistoryProps {
  walletAddress: string;
  onClose: () => void;
}

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [selectedType, setSelectedType] = useState<TransactionType>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [visibleTokenAddresses, setVisibleTokenAddresses] = useState<string[]>([]);
  const [tokenPrices, setTokenPrices] = useState<{[key: string]: number}>({});
  const [copiedAddresses, setCopiedAddresses] = useState<{[key: string]: boolean}>({});
  
  // State for tracking pagination cursor
  const [cursor, setCursor] = useState<string | null>(null);
  
  // Fetch transaction history
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactionHistory', walletAddress, cursor],
    queryFn: () => fetchTransactionHistory(walletAddress, 100, cursor),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!walletAddress,
  });
  
  // Update transactions when data changes
  useEffect(() => {
    if (data?.result) {
      // Set transactions directly if it's the first request (cursor is null)
      if (!cursor) {
        setTransactions(data.result);
        console.log("Setting", data.result.length, "processed transactions");
      } else {
        // Append to existing transactions if loading more pages
        setTransactions(prev => [...prev, ...data.result]);
        console.log("Appending", data.result.length, "more transactions");
      }
      
      // Store the cursor for next page
      if (data.cursor) {
        setCursor(data.cursor);
      }
      
      // Update hasMore based on if we received a full page of results and have a cursor
      setHasMore(data.result.length === 100 && !!data.cursor);
      
      // Extract token addresses from all transfers to prefetch logos
      const tokenAddresses: string[] = [];
      data.result.forEach((tx: Transaction) => {
        // Extract from ERC20 transfers
        if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
          tx.erc20_transfers.forEach(transfer => {
            if (transfer.token_address) {
              tokenAddresses.push(transfer.token_address.toLowerCase());
            }
          });
        }
      });
      
      // Update visible token addresses for logo prefetching
      if (tokenAddresses.length > 0) {
        console.log("Collected", tokenAddresses.length, "unique token addresses from transactions", tokenAddresses);
        setVisibleTokenAddresses(prev => {
          // Remove duplicates manually instead of using Set
          const uniqueAddresses: string[] = [];
          const combined = [...prev, ...tokenAddresses];
          combined.forEach(address => {
            if (!uniqueAddresses.includes(address)) {
              uniqueAddresses.push(address);
            }
          });
          return uniqueAddresses;
        });
      }
    }
  }, [data, cursor]);
  
  // Function to load more transactions
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    
    try {
      setIsLoadingMore(true);
      // The cursor is already set in the data effect hook
      // We don't need to increment the page number anymore
      setPage(prevPage => prevPage + 1); // Keep this for UI state only
    } catch (err) {
      console.error("Error loading more transactions:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, hasMore]);
  
  // Function to copy address to clipboard
  const copyToClipboard = useCallback((address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddresses(prev => ({ ...prev, [address]: true }));
      setTimeout(() => {
        setCopiedAddresses(prev => ({ ...prev, [address]: false }));
      }, 2000);
    }).catch(err => {
      console.error("Error copying address:", err);
    });
  }, []);
  
  // Format timestamp to human-readable date
  const formatTimestamp = (timestamp: string) => {
    return formatDate(new Date(timestamp));
  };
  
  // Format value based on token decimals
  const formatTokenValue = (value: string, decimals: string = '18') => {
    const decimalValue = parseInt(decimals);
    return (parseInt(value) / 10 ** decimalValue).toFixed(decimalValue > 8 ? 4 : 2);
  };
  
  // Helper function to render transaction content by type
  const renderTransactionContent = (tx: Transaction) => {
    const txType = getTransactionType(tx);
    
    if (txType === 'swap' && tx.erc20_transfers && tx.erc20_transfers.length >= 2) {
      // Get sent and received tokens
      const sentTokens = tx.erc20_transfers.filter(t => t.direction === 'send');
      const receivedTokens = tx.erc20_transfers.filter(t => t.direction === 'receive');
      
      // If we have both sent and received tokens, this is a swap
      if (sentTokens.length > 0 && receivedTokens.length > 0) {
        return (
          <div className="mt-2 p-2 border border-white/10 rounded-md bg-black/20">
            <div className="text-xs font-medium mb-2 text-primary-foreground">Token Swap</div>
            
            {/* Group transfers by direction */}
            <div className="flex flex-col space-y-3">
              {/* Tokens Sent (Outgoing) */}
              <div>
                <div className="text-xs text-white/60 mb-1">Sent:</div>
                {sentTokens.map((transfer, i) => (
                  <div key={`swap-out-${tx.hash}-${i}`} className="flex items-center">
                    <TokenLogo 
                      address={transfer.address || ''}
                      symbol={transfer.token_symbol || ''}
                      fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
                      size="sm"
                    />
                    <div className="ml-2 flex items-center">
                      <span className="text-sm font-medium text-red-400">
                        {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Arrow between sent and received */}
              <div className="flex justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4L12 20M12 20L18 14M12 20L6 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              
              {/* Tokens Received (Incoming) */}
              <div>
                <div className="text-xs text-white/60 mb-1">Received:</div>
                {receivedTokens.map((transfer, i) => (
                  <div key={`swap-in-${tx.hash}-${i}`} className="flex items-center">
                    <TokenLogo 
                      address={transfer.address || ''}
                      symbol={transfer.token_symbol || ''}
                      fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
                      size="sm"
                    />
                    <div className="ml-2 flex items-center">
                      <span className="text-sm font-medium text-green-400">
                        {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
    } else if (txType === 'approval') {
      // Special handling for approval transactions
      return (
        <div className="mt-2 p-2 border border-white/10 rounded-md bg-black/20">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-primary-foreground">Token Approval</div>
            {tx.method_label && (
              <div className="text-xs font-mono bg-white/10 rounded px-1.5 py-0.5">
                {tx.method_label}
              </div>
            )}
          </div>
          
          {/* Show which token was approved */}
          {tx.erc20_transfers && tx.erc20_transfers.length > 0 ? (
            <div className="mt-2">
              {tx.erc20_transfers.map((transfer, i) => (
                <div key={`approve-${tx.hash}-${i}`} className="flex items-center">
                  <TokenLogo 
                    address={transfer.address || ''}
                    symbol={transfer.token_symbol || ''}
                    fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
                    size="sm"
                  />
                  <div className="ml-2">
                    <span className="text-sm font-medium">
                      {transfer.token_symbol || 'Unknown Token'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // If no transfers, just show the approval with address
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-green-400" />
                </div>
                <span className="ml-2 text-sm">Approved to: {shortenAddress(tx.to_address)}</span>
              </div>
              <button 
                onClick={() => copyToClipboard(tx.to_address)}
                className="text-white/50 hover:text-white/90 transition-colors ml-2"
              >
                {copiedAddresses[tx.to_address] ? (
                  <Check size={14} className="text-green-400" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          )}
        </div>
      );
    }
    
    // Default: Just show standard token transfers
    if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
      return tx.erc20_transfers.map((transfer, i) => (
        <div key={`${tx.hash}-erc20-${i}`} className="flex items-center mt-2">
          <TokenLogo 
            address={transfer.address || ''}
            symbol={transfer.token_symbol || ''}
            fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
            size="sm"
          />
          <div className="ml-2 flex items-center">
            <div className="mr-1">
              {transfer.direction === 'receive' ? (
                <ArrowDownLeft size={14} className="text-green-400" />
              ) : (
                <ArrowUpRight size={14} className="text-red-400" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center">
                <div className="group relative">
                  <span className="text-sm font-semibold whitespace-nowrap cursor-pointer border-b border-dotted border-white/30" title={transfer.token_symbol || ''}>
                    {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ));
    }
    
    // For transactions with no ERC20 transfers but with native transfers
    if (tx.native_transfers && tx.native_transfers.length > 0) {
      return tx.native_transfers.map((transfer, i) => (
        <div key={`${tx.hash}-native-${i}`} className="flex items-center mt-2">
          <img 
            src="/assets/pls-logo-trimmed.png"
            alt="PLS"
            className="w-6 h-6 rounded-full object-cover border border-white/10"
          />
          <div className="ml-2 flex items-center">
            <div className="mr-1">
              {transfer.direction === 'receive' ? (
                <ArrowDownLeft size={14} className="text-green-400" />
              ) : (
                <ArrowUpRight size={14} className="text-red-400" />
              )}
            </div>
            <span className="text-sm font-semibold">
              {transfer.value_formatted || formatTokenValue(transfer.value)} PLS
            </span>
          </div>
        </div>
      ));
    }
    
    // For transactions with no transfers
    return (
      <div className="text-sm text-white/80 mt-2">
        {tx.method_label || "Contract interaction"}
      </div>
    );
  };
  
  // Use our custom hooks for data prefetching - one for logos, one for prices
  const { 
    logos: prefetchedLogos, 
    isLoading: isLogosPrefetching 
  } = useTokenDataPrefetch(walletAddress, visibleTokenAddresses);
  
  // Use our new batch token prices hook
  const {
    prices: batchPrices,
    isLoading: isPricesFetching
  } = useBatchTokenPrices(visibleTokenAddresses);
  
  // Update token prices whenever batch prices are fetched
  useEffect(() => {
    if (Object.keys(batchPrices).length > 0) {
      setTokenPrices(prevPrices => ({
        ...prevPrices,
        ...batchPrices
      }));
    }
  }, [batchPrices]);
  
  // Debug logging flag
  const DEBUG_LOGGING = false;
  
  // Function to calculate USD value for a transaction
  const calculateUsdValue = (value: string, decimals: string = '18', tokenAddress: string) => {
    // Normalize token address
    const normalizedAddress = tokenAddress?.toLowerCase();
    
    // Handle special case for PLS
    const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const addressToUse = normalizedAddress === plsAddress ? plsAddress : normalizedAddress;
    
    // Check if we have a price for this token
    const price = tokenPrices[addressToUse];
    
    // For debugging
    if (DEBUG_LOGGING) {
      console.log('Calculate USD Value:', { 
        valueRaw: value,
        decimals, 
        tokenAddress: addressToUse,
        price
      });
    }
    
    if (!price) return null;
    
    // Calculate the token amount - use BigInt for large numbers
    const decimalValue = parseInt(decimals);
    const divisor = Math.pow(10, decimalValue);
    
    // Handle potential overflow with large numbers
    let tokenAmount: number;
    try {
      // For very large numbers, use a different approach
      if (value.length > 15) {
        // Parse with decimal point instead of division
        const integerPart = value.substring(0, value.length - decimalValue) || '0';
        const decimalPart = value.substring(value.length - decimalValue) || '0';
        tokenAmount = parseFloat(`${integerPart}.${decimalPart}`);
      } else {
        tokenAmount = parseFloat(value) / divisor;
      }
    } catch (e) {
      console.error('Error calculating token amount:', e);
      tokenAmount = 0;
    }
    
    // Calculate USD value
    const usdValue = tokenAmount * price;
    if (DEBUG_LOGGING) {
      console.log('Calculated USD value:', { tokenAmount, price, usdValue });
    }
    
    return usdValue;
  };
  
  // Filter transactions based on selected type
  const filteredTransactions = transactions.filter(tx => {
    if (selectedType === 'all') return true; // Show all transactions
    return getTransactionType(tx) === selectedType;
  });
  
  // Count transactions by type
  const transactionCounts = transactions.reduce((counts, tx) => {
    const type = getTransactionType(tx);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  // Extract token addresses for logos and prices
  useEffect(() => {
    if (transactions) {
      // Use array instead of Set to avoid iteration issues
      const addresses: string[] = [];
      const addUniqueAddress = (address: string) => {
        const normalizedAddress = address.toLowerCase();
        if (!addresses.includes(normalizedAddress)) {
          addresses.push(normalizedAddress);
        }
      };
      
      transactions.forEach((tx: Transaction) => {
        // Get token addresses from ERC20 transfers
        if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
          tx.erc20_transfers.forEach((transfer: any) => {
            if (transfer.address) {
              addUniqueAddress(transfer.address);
            }
          });
        }
        
        // Add native token address for native transfers
        if (tx.native_transfers && tx.native_transfers.length > 0) {
          addUniqueAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        }
      });
      
      console.log(`Collected ${addresses.length} unique token addresses from transactions`, addresses);
      setVisibleTokenAddresses(addresses);
    }
  }, [transactions]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Loader2 size={32} className="animate-spin mx-auto text-primary" />
          <div className="text-white">Fetching transaction history...</div>
        </div>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="rounded-md bg-yellow-500/20 p-4 text-center">
        <h3 className="font-bold text-lg text-yellow-500 mb-2">Error Loading Transactions</h3>
        <p className="text-white/70">
          There was a problem fetching transaction history. Please try again.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => refetch()}
        >
          <RefreshCw size={16} className="mr-2" />
          Retry
        </Button>
      </div>
    );
  }
  
  return (
    <div className="bg-transparent rounded-md">
      <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
          <p className="text-muted-foreground">
            Showing {filteredTransactions.length} transactions for {shortenAddress(walletAddress)}
          </p>
        </div>
        
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center">
                <Filter size={14} className="mr-2" />
                {selectedType === 'all' ? 'All Transactions' : (
                  selectedType.charAt(0).toUpperCase() + selectedType.slice(1)
                )}
                <ChevronDown size={14} className="ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                className={selectedType === 'all' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('all')}
              >
                All Transactions
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactions.length}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={selectedType === 'swap' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('swap')}
              >
                Swaps
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactionCounts['swap'] || 0}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={selectedType === 'send' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('send')}
              >
                Sent
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactionCounts['send'] || 0}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={selectedType === 'receive' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('receive')}
              >
                Received
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactionCounts['receive'] || 0}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={selectedType === 'approval' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('approval')}
              >
                Approvals
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactionCounts['approval'] || 0}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={selectedType === 'contract' ? 'bg-white/10' : ''}
                onClick={() => setSelectedType('contract')}
              >
                Contract Interactions
                <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                  {transactionCounts['contract'] || 0}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-md">
        <table className="w-full border-collapse">
          <thead className="bg-black/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Block</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredTransactions.map((tx, index) => (
              <tr key={tx.hash + index} className={tx.receipt_status !== '1' ? 'bg-red-500/10' : (index % 2 === 0 ? 'bg-black/5' : 'bg-black/10')}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-white">{formatTimestamp(tx.block_timestamp)}</div>
                  <div className="text-xs text-muted-foreground">
                    {tx.receipt_status === '1' ? (
                      <span className="text-green-400">Success</span>
                    ) : (
                      <span className="text-red-400">Failed</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">
                    {(() => {
                      const type = getTransactionType(tx);
                      switch (type) {
                        case 'swap':
                          return <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs">Swap</span>;
                        case 'send':
                          return <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">Send</span>;
                        case 'receive':
                          return <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">Receive</span>;
                        case 'approval':
                          return <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">Approval</span>;
                        case 'contract':
                          return <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs">Contract</span>;
                        default:
                          return <span className="px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs">Other</span>;
                      }
                    })()}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {tx.method_label || 'Transaction'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-white">
                    {tx.summary || 'Transaction details'}
                    
                    {/* Enhanced Transaction Content Display */}
                    {renderTransactionContent(tx)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-erc20-value-${i}`} className={`${i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                        {transfer.direction === 'receive' ? '+' : '-'}
                        {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol && transfer.token_symbol.length > 15 ? `${transfer.token_symbol.substring(0, 15)}...` : transfer.token_symbol}
                      </div>
                      {/* Add USD value display using batch token prices */}
                      {(() => {
                        const tokenAddress = (transfer.address || '').toLowerCase();
                        // Check if we have a price from our batch hook
                        const hasBatchPrice = !!batchPrices[tokenAddress];
                        const usdValue = calculateUsdValue(transfer.value, transfer.token_decimals, tokenAddress);
                        
                        return usdValue ? (
                          <div className="text-xs text-muted-foreground flex items-center justify-end">
                            {usdValue.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              maximumFractionDigits: 2,
                              minimumFractionDigits: 2
                            })}
                            {hasBatchPrice && <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">✓</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                  
                  {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-native-value-${i}`} className={`${(tx.erc20_transfers && tx.erc20_transfers.length > 0) || i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                        {transfer.direction === 'receive' ? '+' : '-'}
                        {transfer.value_formatted || formatTokenValue(transfer.value)} {(transfer.token_symbol && transfer.token_symbol.length > 15) ? `${transfer.token_symbol.substring(0, 15)}...` : (transfer.token_symbol || 'PLS')}
                      </div>
                      {/* Add USD value display for native PLS token using batch token prices */}
                      {(() => {
                        const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                        // Check if we have a price from our batch hook
                        const hasBatchPrice = !!batchPrices[plsAddress];
                        const usdValue = calculateUsdValue(transfer.value, '18', plsAddress);
                        
                        return usdValue ? (
                          <div className="text-xs text-muted-foreground flex items-center justify-end">
                            {usdValue.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              maximumFractionDigits: 2,
                              minimumFractionDigits: 2
                            })}
                            {hasBatchPrice && <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">✓</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                  
                  <div className="text-xs font-semibold text-white mt-2">
                    Gas: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
                    {/* Add USD value for gas fee using batch prices */}
                    {(() => {
                      const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                      // Check if we have a price from our batch hook
                      const hasBatchPrice = !!batchPrices[plsAddress];
                      const usdValue = calculateUsdValue(tx.transaction_fee.toString(), '18', plsAddress);
                      
                      return usdValue ? (
                        <div className="flex items-center justify-end mt-0.5">
                          {usdValue.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2
                          })}
                          {hasBatchPrice && <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">✓</span>}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <a 
                    href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-white/80 transition-colors"
                  >
                    <div className="flex justify-center mb-1">
                      <ExternalLink size={16} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {parseInt(tx.block_number).toLocaleString()}
                    </div>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Mobile Transaction Cards */}
      <div className="md:hidden">
        {filteredTransactions.map((tx, index) => (
          <div key={tx.hash + index} className="mb-4 glass-card border border-white/10 rounded-md overflow-hidden">
            {/* Transaction Header - Date & Status */}
            <div className="p-3 border-b border-white/10 flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">{formatTimestamp(tx.block_timestamp)}</div>
                <div className="text-xs text-muted-foreground">
                  Type: {getTransactionType(tx).charAt(0).toUpperCase() + getTransactionType(tx).slice(1)}
                </div>
              </div>
              <div className="flex items-center">
                <span className={`px-2 py-1 text-xs rounded-sm ${
                  tx.receipt_status === '1' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {tx.receipt_status === '1' ? 'Success' : 'Failed'}
                </span>
                <a 
                  href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
            
            {/* Transaction Body - Content and Details */}
            <div className="p-3">
              {/* Method Label / Hash */}
              {tx.method_label && (
                <div className="mb-2">
                  <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded">
                    {tx.method_label}
                  </span>
                </div>
              )}
              
              {/* Enhanced Transaction Content Display - Mobile version */}
              {renderTransactionContent(tx)}
              
              {/* Fee Info */}
              <div className="mt-3 text-xs text-muted-foreground flex justify-between">
                <div>Gas: {parseFloat(tx.transaction_fee).toFixed(6)} PLS</div>
                <div>Block: {parseInt(tx.block_number).toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Load More Button */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button 
            variant="outline"
            disabled={isLoadingMore}
            onClick={loadMore}
            className="w-full sm:w-auto"
          >
            {isLoadingMore ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                Load More Transactions
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}