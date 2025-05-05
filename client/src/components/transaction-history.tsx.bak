import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TokenLogo } from '@/components/token-logo';
import { 
  Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, ChevronRight, 
  Copy, Check, ArrowRight, Filter, RefreshCw,
  CircleDollarSign, ArrowUpDown, ShieldCheck, Code
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { 
  fetchTransactionHistory, fetchTransactionByHash, 
  Transaction, TransactionTransfer 
} from '@/lib/api';
import { formatDate, shortenAddress, formatNumber } from '@/lib/utils';
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
  return 'contract';
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
  
  // State for expanded transaction details
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [detailedTx, setDetailedTx] = useState<{[hash: string]: Transaction}>({});
  
  // State for tracking pagination cursor
  const [cursor, setCursor] = useState<string | null>(null);
  
  // Fetch transaction history - don't include cursor in the queryKey to prevent re-fetching
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactionHistory', walletAddress],
    queryFn: () => fetchTransactionHistory(walletAddress, 100, cursor),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!walletAddress,
    refetchOnWindowFocus: false,
  });
  
  // Update transactions when data changes - use a stable reference for this effect
  useEffect(() => {
    if (data?.result) {
      // Process the data in a stable way to prevent flickering
      if (!cursor) {
        // Initial load
        setTransactions(data.result);
        console.log("Setting", data.result.length, "processed transactions");
      } else {
        // Only append if we're loading more (cursor is not null)
        setTransactions(prev => [...prev, ...data.result]);
        console.log("Appending", data.result.length, "more transactions");
      }
      
      // Store the cursor for next page - but don't do this during rendering
      if (data.cursor && data.cursor !== cursor) {
        // Use a timeout to prevent immediate state updates during rendering
        setTimeout(() => {
          setCursor(data.cursor);
        }, 0);
      }
      
      // Update hasMore based on if we received a full page of results and have a cursor
      setHasMore(data.result.length === 100 && !!data.cursor);
      
      // Extract token addresses from all transfers to prefetch logos
      const tokenAddresses: string[] = [];
      data.result.forEach((tx: Transaction) => {
        // Extract from ERC20 transfers
        if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
          tx.erc20_transfers.forEach(transfer => {
            // Try token_address first (our custom field), then fall back to address
            const tokenAddress = transfer.token_address || transfer.address;
            if (tokenAddress) {
              tokenAddresses.push(tokenAddress.toLowerCase());
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
  
  // Function to load more transactions - this only triggers the refetch
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    
    try {
      setIsLoadingMore(true);
      // Simply increment page number for UI state
      setPage(prevPage => prevPage + 1);
      
      // Manually trigger a refetch (the cursor is already set)
      await refetch();
    } catch (err) {
      console.error("Error loading more transactions:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, hasMore, refetch]);
  
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
  
  // Helper function to get the token address from a transfer
  const getTokenAddress = (transfer: TransactionTransfer): string => {
    return (transfer.token_address || transfer.address || '').toLowerCase();
  };
  
  // Function to toggle expanded state for a transaction
  const toggleExpand = useCallback(async (hash: string) => {
    // If it's already expanded, collapse it
    if (expandedTx === hash) {
      setExpandedTx(null);
      return;
    }
    
    // Otherwise, expand it and fetch detailed data if needed
    setExpandedTx(hash);
    
    // Check if we already have detailed data
    if (!detailedTx[hash]) {
      try {
        // Fetch detailed transaction data
        const txData = await fetchTransactionByHash(hash);
        if (txData) {
          setDetailedTx(prev => ({
            ...prev,
            [hash]: txData
          }));
        }
      } catch (error) {
        console.error(`Error fetching detailed transaction data for ${hash}:`, error);
      }
    }
  }, [expandedTx, detailedTx]);
  
  // Debug logging flag
  const DEBUG_LOGGING = false;
  
  // Get transaction type icon and badge
  const getTransactionTypeInfo = (txType: TransactionType) => {
    let icon;
    let badge;
    let badgeColor;
    
    switch (txType) {
      case 'swap':
        icon = <ArrowUpDown className="h-4 w-4" />;
        badge = 'Swap';
        badgeColor = 'bg-blue-500/20 text-blue-400';
        break;
      case 'send':
        icon = <ArrowUpRight className="h-4 w-4" />;
        badge = 'Send';
        badgeColor = 'bg-red-500/20 text-red-400';
        break;
      case 'receive':
        icon = <ArrowDownLeft className="h-4 w-4" />;
        badge = 'Receive';
        badgeColor = 'bg-green-500/20 text-green-400';
        break;
      case 'approval':
        icon = <ShieldCheck className="h-4 w-4" />;
        badge = 'Approval';
        badgeColor = 'bg-yellow-500/20 text-yellow-400';
        break;
      case 'contract':
        icon = <Code className="h-4 w-4" />;
        badge = 'Contract';
        badgeColor = 'bg-purple-500/20 text-purple-400';
        break;
      default:
        icon = <CircleDollarSign className="h-4 w-4" />;
        badge = 'Transaction';
        badgeColor = 'bg-gray-500/20 text-gray-400';
    }
    
    return { icon, badge, badgeColor };
  };
  
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
  
  // Extract token addresses for logos and prices - use useCallback to avoid recreating the function
  const updateTokenAddresses = useCallback(() => {
    if (!transactions || transactions.length === 0) return;
    
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
          const tokenAddress = getTokenAddress(transfer);
          if (tokenAddress) {
            addUniqueAddress(tokenAddress);
          }
        });
      }
      
      // Add native token address for native transfers
      if (tx.native_transfers && tx.native_transfers.length > 0) {
        addUniqueAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      }
    });
    
    // Only update if different to avoid unnecessary renders
    if (addresses.length > 0) {
      console.log(`Collected ${addresses.length} unique token addresses from transactions`, addresses);
      
      // Check if the addresses array is different from the current state
      let needsUpdate = addresses.length !== visibleTokenAddresses.length;
      if (!needsUpdate) {
        // Check if any address is different
        for (let i = 0; i < addresses.length; i++) {
          if (!visibleTokenAddresses.includes(addresses[i])) {
            needsUpdate = true;
            break;
          }
        }
      }
      
      if (needsUpdate) {
        setVisibleTokenAddresses(addresses);
      }
    }
  }, [transactions, visibleTokenAddresses]);
  
  // Call the update function when transactions change
  useEffect(() => {
    updateTokenAddresses();
  }, [updateTokenAddresses]);
  
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
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-bold">Transaction History</h2>
          <div className="text-xs text-white/60 bg-white/10 rounded-full px-2 py-0.5">
            {filteredTransactions.length} Transactions
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
            <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
          </svg>
        </Button>
      </div>
      
      <div className="px-3 py-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                  <Filter size={14} />
                  Filter
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setSelectedType('all')}
                  className={selectedType === 'all' ? 'bg-primary text-white' : ''}
                >
                  All Transactions
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactions.length}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSelectedType('swap')}
                  className={selectedType === 'swap' ? 'bg-primary text-white' : ''}
                >
                  Swaps Only
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactionCounts['swap'] || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSelectedType('send')}
                  className={selectedType === 'send' ? 'bg-primary text-white' : ''}
                >
                  Sent Only
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactionCounts['send'] || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSelectedType('receive')}
                  className={selectedType === 'receive' ? 'bg-primary text-white' : ''}
                >
                  Received Only
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactionCounts['receive'] || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSelectedType('approval')}
                  className={selectedType === 'approval' ? 'bg-primary text-white' : ''}
                >
                  Approvals Only
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactionCounts['approval'] || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSelectedType('contract')}
                  className={selectedType === 'contract' ? 'bg-primary text-white' : ''}
                >
                  Contract Interactions Only
                  <span className="ml-auto px-1.5 py-0.5 bg-gray-500/20 text-xs rounded">
                    {transactionCounts['contract'] || 0}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span className="ml-1.5">Refresh</span>
            </Button>
          </div>
          
          {/* Status info */}
          {isLoading && !data && (
            <div className="text-xs text-white/60 flex items-center">
              <Loader2 size={12} className="animate-spin mr-1.5" />
              Loading transactions...
            </div>
          )}
          {filteredTransactions.length === 0 && !isLoading && (
            <div className="text-xs text-white/60">No transactions found</div>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {isError && (
          <div className="p-4 text-center">
            <div className="text-red-400 mb-2">Error loading transactions</div>
            <div className="text-xs text-white/60">{(error as Error)?.message || 'Unknown error'}</div>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3" 
              onClick={() => refetch()}
            >
              Try Again
            </Button>
          </div>
        )}
        
        {isLogosPrefetching && !data && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <span className="ml-2 text-sm text-white/60">Loading transaction data...</span>
          </div>
        )}
        
        {filteredTransactions.length === 0 && !isLoading && !isError && (
          <div className="flex flex-col items-center justify-center h-32 p-4 text-center">
            <div className="text-white/60 mb-2">No transactions found</div>
            {selectedType !== 'all' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedType('all')}
              >
                Show All Transactions
              </Button>
            )}
          </div>
        )}
        
        {/* List-based view for transactions */}
        <div className="divide-y divide-white/10">
          {filteredTransactions.map((tx) => {
            const txType = getTransactionType(tx);
            const { icon, badge, badgeColor } = getTransactionTypeInfo(txType);
            const isExpanded = expandedTx === tx.hash;
            
            // Get the transaction data to display (use detailed data if available)
            const displayTx = detailedTx[tx.hash] || tx;
            
            // Format date for display
            const formattedDate = formatTimestamp(tx.block_timestamp);
            
            return (
              <div 
                key={tx.hash}
                className={`px-4 py-3 hover:bg-white/5 transition-colors ${isExpanded ? 'bg-white/5' : ''}`}
              >
                {/* Transaction header row */}
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpand(tx.hash)}
                >
                  {/* Left side: Type icon, badge, and addresses */}
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="flex items-center justify-center">
                      {icon}
                    </div>
                    
                    {/* Type badge and addresses */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`${badgeColor} border-0 h-6`}>
                          {badge}
                        </Badge>
                        
                        {/* Method label if available */}
                        {tx.method_label && (
                          <span className="text-xs font-mono bg-white/10 rounded px-1.5 py-0.5">
                            {tx.method_label}
                          </span>
                        )}
                        
                        {/* Status badge */}
                        {tx.receipt_status === '1' ? (
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-0">
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-0">
                            Failed
                          </Badge>
                        )}
                      </div>
                      
                      {/* From/To addresses */}
                      <div className="flex items-center mt-1 text-xs text-white/60">
                        <span className="mr-1">From:</span>
                        <span className="font-mono">{shortenAddress(tx.from_address)}</span>
                        <ArrowRight className="h-3 w-3 mx-1" />
                        <span className="mr-1">To:</span>
                        <span className="font-mono">{shortenAddress(tx.to_address)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right side: Date, gas, and expand/collapse */}
                  <div className="flex flex-col items-end">
                    <div className="text-xs text-white/60">{formattedDate}</div>
                    <div className="flex items-center mt-1">
                      <a 
                        href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white/60 hover:text-white flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                        <ExternalLink size={10} className="ml-0.5" />
                      </a>
                      <div className="ml-3">
                        {isExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    {/* Token transfers section */}
                    {(displayTx.erc20_transfers && displayTx.erc20_transfers.length > 0) || 
                     (displayTx.native_transfers && displayTx.native_transfers.length > 0) ? (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium mb-2">Token Transfers</h4>
                        
                        {/* ERC20 Transfers */}
                        {displayTx.erc20_transfers && displayTx.erc20_transfers.length > 0 && (
                          <div className="space-y-2">
                            {displayTx.erc20_transfers.map((transfer, i) => (
                              <div key={`erc20-${i}`} className="flex items-center p-2 bg-black/20 rounded-md">
                                <div className="flex-shrink-0">
                                  <TokenLogo 
                                    address={getTokenAddress(transfer)}
                                    symbol={transfer.token_symbol || ''}
                                    fallbackLogo={prefetchedLogos[getTokenAddress(transfer)]}
                                    size="sm"
                                  />
                                </div>
                                <div className="ml-3 flex-1">
                                  <div className="flex items-center">
                                    <span className="text-sm font-medium">
                                      {transfer.token_symbol || 'Unknown Token'}
                                    </span>
                                    <span className="text-xs opacity-70 ml-1">
                                      ({transfer.token_name || 'Unknown Token'})
                                    </span>
                                  </div>
                                  <div className="flex items-center text-xs mt-1">
                                    <span className="font-mono text-white/60">
                                      {shortenAddress(transfer.from_address)}
                                    </span>
                                    <ArrowRight className="h-3 w-3 mx-1 text-white/60" />
                                    <span className="font-mono text-white/60">
                                      {shortenAddress(transfer.to_address)}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-auto text-right">
                                  <div className={`text-sm font-medium ${transfer.direction === 'send' ? 'text-red-400' : 'text-green-400'}`}>
                                    {transfer.direction === 'send' ? '-' : '+'}{transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)}
                                  </div>
                                  <div className="text-xs text-white/60 mt-1">
                                    {transfer.direction === 'send' ? 'Sent' : 'Received'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Native Transfers */}
                        {displayTx.native_transfers && displayTx.native_transfers.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {displayTx.native_transfers.map((transfer, i) => (
                              <div key={`native-${i}`} className="flex items-center p-2 bg-black/20 rounded-md">
                                <div className="flex-shrink-0">
                                  <TokenLogo 
                                    address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                                    symbol="PLS"
                                    size="sm"
                                  />
                                </div>
                                <div className="ml-3 flex-1">
                                  <div className="flex items-center">
                                    <span className="text-sm font-medium">
                                      {transfer.token_symbol || 'PLS'}
                                    </span>
                                    <span className="text-xs opacity-70 ml-1">
                                      ({transfer.token_name || 'PulseChain'})
                                    </span>
                                  </div>
                                  <div className="flex items-center text-xs mt-1">
                                    <span className="font-mono text-white/60">
                                      {shortenAddress(transfer.from_address)}
                                    </span>
                                    <ArrowRight className="h-3 w-3 mx-1 text-white/60" />
                                    <span className="font-mono text-white/60">
                                      {shortenAddress(transfer.to_address)}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-auto text-right">
                                  <div className={`text-sm font-medium ${transfer.direction === 'send' ? 'text-red-400' : 'text-green-400'}`}>
                                    {transfer.direction === 'send' ? '-' : '+'}{transfer.value_formatted || formatTokenValue(transfer.value, '18')}
                                  </div>
                                  <div className="text-xs text-white/60 mt-1">
                                    {transfer.direction === 'send' ? 'Sent' : 'Received'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      // If no transfers, show a message
                      <div className="mb-4 text-white/60 text-sm">
                        No token transfers in this transaction
                      </div>
                    )}
                    
                    {/* Transaction details section */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Transaction Details</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Hash</span>
                          <div className="flex items-center mt-1">
                            <span className="font-mono text-xs">{shortenAddress(tx.hash, 18)}</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(tx.hash);
                              }}
                              className="ml-1 text-white/50 hover:text-white transition-colors"
                            >
                              {copiedAddresses[tx.hash] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Status</span>
                          <span className={`mt-1 ${tx.receipt_status === '1' ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.receipt_status === '1' ? 'Success' : 'Failed'}
                          </span>
                        </div>
                        
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Block</span>
                          <span className="font-mono mt-1">{tx.block_number}</span>
                        </div>
                        
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Gas Used</span>
                          <span className="mt-1">{formatNumber(parseInt(tx.receipt_gas_used))} gas</span>
                        </div>
                        
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Gas Price</span>
                          <span className="mt-1">{(parseInt(tx.gas_price) / 1e9).toFixed(2)} Gwei</span>
                        </div>
                        
                        <div className="flex flex-col p-2 bg-black/20 rounded-md">
                          <span className="text-xs text-white/60">Total Fee</span>
                          <span className="mt-1">{(parseInt(tx.transaction_fee) / 1e18).toFixed(8)} PLS</span>
                        </div>
                      </div>

                      {/* Additional Transaction Details */}
                      <div className="mt-4 space-y-2">
                        {/* Method information if available */}
                        {tx.method_label && (
                          <div className="text-xs font-mono bg-white/10 rounded px-3 py-2 inline-block">
                            Method: {tx.method_label}
                          </div>
                        )}

                        {/* Summary if available */}
                        {tx.summary && (
                          <div className="text-white/80 text-sm">
                            <span className="text-white/60">Summary: </span>
                            {tx.summary}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Load More Button */}
        {hasMore && (
          <div className="p-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="w-full"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Loading More...
                </>
              ) : (
                "Load More Transactions"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}