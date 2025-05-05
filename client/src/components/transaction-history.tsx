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

// Transaction types
interface TransactionTransfer {
  token_name?: string;
  token_symbol?: string;
  token_logo?: string | null;
  token_decimals?: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  address?: string;
  log_index?: number;
  value: string;
  value_formatted?: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
  security_score?: number;
  direction?: string;
  internal_transaction?: boolean;
}

interface Transaction {
  hash: string;
  nonce: string;
  transaction_index: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  value: string;
  gas: string;
  gas_price: string;
  receipt_gas_used: string;
  receipt_status: string;
  block_timestamp: string;
  block_number: string;
  transaction_fee: string;
  method_label?: string;
  erc20_transfers?: TransactionTransfer[];
  native_transfers?: TransactionTransfer[];
  nft_transfers?: any[];
  summary?: string;
  category?: string;
  possible_spam?: boolean;
}

interface TransactionHistoryProps {
  walletAddress: string;
  onClose: () => void;
}

// Number of transactions to load per batch (Moralis free plan limit is 100)
const TRANSACTIONS_PER_BATCH = 100;

// Define transaction type options
type TransactionType = 'all' | 'swap' | 'send' | 'receive' | 'approval' | 'contract';

// Helper function to determine transaction type
const getTransactionType = (tx: Transaction): TransactionType => {
  if (!tx.category) {
    // Try to infer from other properties if category is not available
    if (tx.method_label?.toLowerCase().includes('swap')) {
      return 'swap';
    } else if (tx.method_label?.toLowerCase().includes('approve')) {
      return 'approval';
    } else if (tx.erc20_transfers && tx.erc20_transfers.some(t => t.from_address.toLowerCase() === t.to_address.toLowerCase())) {
      return 'contract'; // Self-transfers are often contract interactions
    } else if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
      return 'send'; // Default for token transfers
    } else {
      return 'all'; // Default fallback
    }
  }
  
  // If category is provided, use it
  const category = tx.category.toLowerCase();
  
  if (category.includes('swap') || category.includes('trade')) {
    return 'swap';
  } else if (category.includes('send') || category.includes('transfer')) {
    return 'send';
  } else if (category.includes('receive')) {
    return 'receive';
  } else if (category.includes('approve') || category.includes('approval')) {
    return 'approval';
  } else if (category.includes('contract') || category.includes('deploy') || category.includes('execute')) {
    return 'contract';
  }
  
  return 'all';
};

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [visibleTokenAddresses, setVisibleTokenAddresses] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);
  const [requestTimeoutId, setRequestTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  // State to track copied addresses
  const [copiedAddresses, setCopiedAddresses] = useState<Record<string, boolean>>({});
  
  // Add state for transaction type filter
  const [selectedType, setSelectedType] = useState<TransactionType>('all');
  
  // Function to copy text to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Set the copied state for this specific address
        setCopiedAddresses(prev => ({ ...prev, [text]: true }));
        
        // Reset the copied state after 2 seconds
        setTimeout(() => {
          setCopiedAddresses(prev => ({ ...prev, [text]: false }));
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  }, []);

  // Set up a timeout to show an error message if the transactions don't load within reasonable time
  useEffect(() => {
    // Clear any existing timeout when component mounts or is unmounted
    return () => {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    };
  }, [requestTimeoutId]);

  // Initial transaction data fetch
  const { isLoading, isError, data: initialData, refetch } = useQuery({
    queryKey: ['transactions', walletAddress], // Removed timestamp to prevent infinite fetching
    queryFn: async () => {
      console.log('Fetching transaction history for:', walletAddress);
      
      // Set a timeout to detect if the request is taking too long
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
      
      const timeoutId = setTimeout(() => {
        console.log('Transaction history request is taking too long');
        setLoadingTimeout(true);
      }, 30000); // 30 seconds timeout - increased to allow for slow API response
      
      setRequestTimeoutId(timeoutId);
      setLoadingTimeout(false);
      
      try {
        // Use timestamp to force fresh data from server
        const timestamp = Date.now();
        const response = await fetchTransactionHistory(walletAddress, TRANSACTIONS_PER_BATCH);
        
        // Clear timeout as we got a response
        if (requestTimeoutId) clearTimeout(requestTimeoutId);
        setLoadingTimeout(false);
        
        console.log('Initial transaction history fetched:', response ? 'yes' : 'no', 
          response?.result ? `${response.result.length} transactions` : '', 
          'Response data:', JSON.stringify(response).substring(0, 300) + '...');
        
        // Check if there's an error
        if (response?.error) {
          console.error('Error in transaction history response:', response.error);
          throw new Error(response.error);
        }
        
        // Handle empty results specifically
        if (!response || !response.result || response.result.length === 0) {
          console.log('No transactions found in response, clearing state');
          setTransactions([]);
          setHasMore(false);
          return { result: [], cursor: null, page: 0, page_size: TRANSACTIONS_PER_BATCH };
        }
        
        // Extract unique token addresses for price fetching
        const uniqueTokenAddresses = new Set<string>();
        
        // Process transactions to extract token addresses and collect data for token price fetching
        (response.result || []).forEach(tx => {
          // Process ERC20 transfers to collect token addresses
          if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
            tx.erc20_transfers.forEach((transfer: any) => {
              if (transfer.address) {
                uniqueTokenAddresses.add(transfer.address.toLowerCase());
              }
            });
          }
        });
        
        // Log the collected token addresses
        console.log('Collected unique token addresses from transactions', Array.from(uniqueTokenAddresses));
        
        // Update visible token addresses for the price fetching hook
        setVisibleTokenAddresses(Array.from(uniqueTokenAddresses));
        
        // Now process any transaction data that might need additional enhancement
        // This would normally be done on the server, but we can also do it here if needed
        const processedTransactions = (response.result || []);
        
        // Update state with the processed data
        console.log(`Setting ${processedTransactions.length} processed transactions`);
        setTransactions(processedTransactions);
        setNextCursor(response.cursor);
        setHasMore(!!response.cursor); // Has more if cursor exists
        
        return response;
      } catch (error) {
        // Clear timeout on error
        if (requestTimeoutId) clearTimeout(requestTimeoutId);
        setLoadingTimeout(false);
        
        console.error('Error fetching transaction history:', error);
        throw error;
      }
    },
    enabled: !!walletAddress,
    staleTime: 0, // Don't use stale data
    gcTime: 0, // Don't keep data in cache
    refetchOnMount: true, // Always refetch when component mounts
    retry: 2, // Reduce retries to prevent long loading times
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 5000), // Faster retry with shorter max delay
    retryOnMount: true
  });
  
  // Function to load more transactions
  const loadMoreTransactions = useCallback(async () => {
    if (!nextCursor || isLoadingMore || !walletAddress) return;
    
    setIsLoadingMore(true);
    
    // Set a timeout for loading more transactions
    if (requestTimeoutId) clearTimeout(requestTimeoutId);
    
    const timeoutId = setTimeout(() => {
      console.log('Load more transactions request is taking too long');
      setLoadingTimeout(true);
      setIsLoadingMore(false);
      // Don't set hasMore to false to allow retry
    }, 30000); // 30 seconds timeout (increased from 20s)
    
    setRequestTimeoutId(timeoutId);
    
    try {
      const moreData = await fetchTransactionHistory(
        walletAddress, 
        TRANSACTIONS_PER_BATCH, 
        nextCursor
      );
      
      // Clear timeout as we got a response
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
      setLoadingTimeout(false);
      
      if (moreData?.error) {
        console.error('Error in load more transaction response:', moreData.error);
        throw new Error(moreData.error);
      }
      
      if (moreData?.result && moreData.result.length > 0) {
        // Extract unique token addresses for price fetching
        const newTokenAddresses = new Set<string>();
        
        // Process transactions to extract token addresses for price fetching
        moreData.result.forEach(tx => {
          // Process ERC20 transfers to collect token addresses
          if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
            tx.erc20_transfers.forEach((transfer: any) => {
              if (transfer.address) {
                newTokenAddresses.add(transfer.address.toLowerCase());
              }
            });
          }
        });
        
        // Log the collected token addresses
        console.log('Collected unique token addresses from new transactions', Array.from(newTokenAddresses));
        
        // Update visible token addresses for the price fetching hook by adding any new ones
        setVisibleTokenAddresses(prev => {
          const updated = [...prev];
          newTokenAddresses.forEach(addr => {
            if (!updated.includes(addr)) {
              updated.push(addr);
            }
          });
          return updated;
        });
        
        // Append new transactions to existing list
        setTransactions(prev => [...prev, ...moreData.result]);
        setNextCursor(moreData.cursor);
        setHasMore(!!moreData.cursor); // Has more if cursor exists
      } else {
        // No more data available
        console.log('No more transactions available');
        setHasMore(false);
      }
    } catch (error) {
      // Clear timeout on error
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
      setLoadingTimeout(false);
      
      console.error('Error loading more transactions:', error);
      // Don't set hasMore to false to allow retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, walletAddress, requestTimeoutId]);

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return formatDate(new Date(timestamp));
  };

  // Format value based on token decimals
  const formatTokenValue = (value: string, decimals: string = '18') => {
    const decimalValue = parseInt(decimals);
    return (parseInt(value) / 10 ** decimalValue).toFixed(decimalValue > 8 ? 4 : 2);
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
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm glass-card">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 size={40} className="animate-spin text-white mb-4" />
          <h3 className="text-xl font-bold text-white">
            {loadingTimeout ? 'Still Loading...' : 'Loading Transaction History...'}
          </h3>
          <p className="text-muted-foreground mt-2">
            {loadingTimeout ? (
              <>
                The server is taking longer than expected to respond. 
                <br />This could be due to high network traffic or temporary API limitations.
                <br />You can wait or try again later.
              </>
            ) : (
              'This may take a moment depending on your transaction count'
            )}
          </p>
          
          {loadingTimeout && (
            <div className="mt-4">
              <button
                onClick={() => {
                  // Clear timeout state
                  setLoadingTimeout(false);
                  // Try again
                  refetch();
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
              >
                <RefreshCw size={16} className="mr-1" />
                <span className="text-sm font-medium">Try Again</span>
              </button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm glass-card">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <h3 className="text-xl font-bold text-red-400 mb-2">Error Loading Transactions</h3>
          <p className="text-muted-foreground mb-4">
            There was an error loading the transaction history.
            <br />Please try again later or check your connection.
          </p>
          <button
            onClick={() => {
              refetch();
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
          >
            <RefreshCw size={16} className="mr-1" />
            <span className="text-sm font-medium">Try Again</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200 mt-2"
          >
            <ChevronDown size={16} className="mr-1" />
            <span className="text-sm font-medium">Close</span>
          </button>
        </div>
      </Card>
    );
  }
  
  // Empty state
  if (!transactions || transactions.length === 0) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm glass-card">
        <h3 className="text-xl font-bold mb-2 text-white">
          No transactions found
        </h3>
        <p className="text-muted-foreground mb-4">
          No transaction history was found for this wallet.
        </p>
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200 mx-auto"
        >
          <ChevronDown size={16} className="mr-1" />
          <span className="text-sm font-medium">Close</span>
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-lg backdrop-blur-sm glass-card">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-bold text-white flex items-center">
            Transaction History
            <span className="text-white text-sm ml-2 opacity-60">
              {transactions.length} transactions
            </span>
          </h2>
          
          {/* Filter dropdown */}
          <div className="flex flex-wrap gap-2 items-center">
            {!isPricesFetching && Object.keys(batchPrices).length > 0 && (
              <span className="px-2 py-0.5 bg-green-500/20 text-xs rounded-md text-green-400 mr-2">
                Batch Prices
              </span>
            )}
            {isPricesFetching && (
              <span className="px-2 py-0.5 bg-yellow-500/20 text-xs rounded-md text-yellow-400 mr-2">
                Loading Prices...
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200">
                  <Filter size={16} />
                  <span className="text-sm font-medium capitalize">
                    {selectedType === 'all' ? 'All Transactions' : selectedType}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-card border border-white/10 bg-black/60 backdrop-blur-lg">
                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'all' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('all')}
                >
                  All Transactions
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactions.length}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'swap' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('swap')}
                >
                  Swaps
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactionCounts.swap || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'send' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('send')}
                >
                  Sends
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactionCounts.send || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'receive' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('receive')}
                >
                  Receives
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactionCounts.receive || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'approval' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('approval')}
                >
                  Approvals
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactionCounts.approval || 0}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`cursor-pointer ${selectedType === 'contract' ? 'bg-primary/20 text-primary' : ''}`}
                  onClick={() => setSelectedType('contract')}
                >
                  Contract Interactions
                  <span className="ml-auto text-xs text-muted-foreground">
                    {transactionCounts.contract || 0}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={() => {
                  if (loadingTimeout) {
                    // If in timeout state, clear it and retry
                    setLoadingTimeout(false);
                    if (requestTimeoutId) clearTimeout(requestTimeoutId);
                    loadMoreTransactions();
                  } else {
                    // Normal load more
                    loadMoreTransactions();
                  }
                }}
                disabled={isLoadingMore && !loadingTimeout}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingMore && !loadingTimeout ? (
                  <Loader2 size={16} className="animate-spin text-white" />
                ) : (
                  <Plus size={16} />
                )}
              </button>
            )}
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
            >
              <ChevronDown size={16} />
              <span className="text-sm font-medium">Close</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Transactions Table - Desktop View */}
      <div className="hidden md:block">
        <table className="w-full">
          <thead className="bg-black/40 border-b border-white/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                Details
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">
                Link
              </th>
            </tr>
          </thead>
          <tbody className="bg-black/20 backdrop-blur-sm divide-y divide-border">
            {filteredTransactions.map((tx, index) => (
              <tr key={tx.hash + index} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-white">
                    {formatTimestamp(tx.block_timestamp)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-col">
                    <div className="flex items-center">
                      <span className={`
                        mr-1 px-1.5 py-0.5 text-xs font-medium rounded-sm ${
                          tx.receipt_status === '1' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                        {tx.receipt_status === '1' ? 'Success' : 'Failed'}
                      </span>
                    </div>
                    <div className="flex items-center mt-1">
                      <span className="text-xs font-medium text-white/70">
                        Type: {getTransactionType(tx).charAt(0).toUpperCase() + getTransactionType(tx).slice(1)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-white">
                    {tx.summary || 'Transaction details'}
                    
                    {/* ERC20 Transfers */}
                    {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
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
                                <span className="text-sm font-semibold whitespace-nowrap cursor-pointer border-b border-dotted border-white/30" title={transfer.token_symbol}>
                                  {transfer.token_symbol && transfer.token_symbol.length > 15 
                                    ? `${transfer.token_symbol.substring(0, 15)}...` 
                                    : transfer.token_symbol}
                                </span>
                                <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                                  <div className="mb-2 text-xs">
                                    <span className="text-muted-foreground">Contract:</span>
                                    <div className="flex items-center mt-1">
                                      <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                        {shortenAddress(transfer.address || '')}
                                      </span>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(transfer.address || '');
                                        }}
                                        className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                        title="Copy contract address"
                                      >
                                        {copiedAddresses[transfer.address || ''] ? (
                                          <Check size={12} className="text-green-400" />
                                        ) : (
                                          <Copy size={12} className="text-white/70 hover:text-white" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-col space-y-1 text-xs">
                                    <a 
                                      href={`https://dexscreener.com/pulsechain/${transfer.address}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      DexScreener
                                    </a>
                                    <a 
                                      href={`https://otter.pulsechain.com/address/${transfer.address}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      Otterscan
                                    </a>
                                    <a 
                                      href={`https://scan.pulsechain.com/token/${transfer.address}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      PulseScan
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                              <Link 
                                to={`/${transfer.direction === 'receive' ? transfer.from_address : transfer.to_address}`} 
                                className="text-white hover:text-gray-300"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Native Transfers */}
                    {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
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
                          <div className="flex flex-col">
                            <div className="flex items-center">
                              <div className="group relative">
                                <span className="text-sm font-semibold whitespace-nowrap cursor-pointer border-b border-dotted border-white/30" title={transfer.token_symbol || 'PLS'}>
                                  {(transfer.token_symbol && transfer.token_symbol.length > 15) 
                                    ? `${transfer.token_symbol.substring(0, 15)}...` 
                                    : (transfer.token_symbol || 'PLS')}
                                </span>
                                <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                                  <div className="mb-2 text-xs">
                                    <span className="text-muted-foreground">Type:</span>
                                    <div className="flex items-center mt-1">
                                      <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                        Native Token
                                      </span>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
                                        }}
                                        className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                        title="Copy PLS token address"
                                      >
                                        {copiedAddresses['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] ? (
                                          <Check size={12} className="text-green-400" />
                                        ) : (
                                          <Copy size={12} className="text-white/70 hover:text-white" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-col space-y-1 text-xs">
                                    <a 
                                      href="https://dexscreener.com/pulsechain/0x8a810ea8B121d08342E9e7696f4a9915cBE494B7" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      DexScreener
                                    </a>
                                    <a 
                                      href="https://otter.pulsechain.com" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      Otterscan
                                    </a>
                                    <a 
                                      href="https://scan.pulsechain.com" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200"
                                    >
                                      <ExternalLink size={10} className="mr-1" />
                                      PulseScan
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                              <Link 
                                to={`/${transfer.direction === 'receive' ? transfer.from_address : transfer.to_address}`} 
                                className="text-white hover:text-gray-300"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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
                  className="ml-2 text-white hover:text-white/80 transition-colors"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>
            
            {/* Transaction Body - Details */}
            <div className="p-3">
              {/* Transaction summary if available */}
              {tx.summary && (
                <div className="mb-2 text-sm">{tx.summary}</div>
              )}
              
              {/* ERC20 Transfers */}
              {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                <div key={`mobile-${tx.hash}-erc20-${i}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center">
                    <TokenLogo 
                      address={transfer.address || ''}
                      symbol={transfer.token_symbol || ''}
                      fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
                      size="sm"
                    />
                    <div className="ml-2">
                      <div className="flex items-center">
                        {transfer.direction === 'receive' ? (
                          <ArrowDownLeft size={14} className="text-green-400 mr-1" />
                        ) : (
                          <ArrowUpRight size={14} className="text-red-400 mr-1" />
                        )}
                        <div className="group relative">
                          <span className="text-sm font-medium border-b border-dotted border-white/30" title={transfer.token_symbol}>
                            {transfer.token_symbol && transfer.token_symbol.length > 15 
                              ? `${transfer.token_symbol.substring(0, 15)}...` 
                              : transfer.token_symbol}
                          </span>
                          <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                            <div className="mb-2 text-xs">
                              <span className="text-muted-foreground">Contract:</span>
                              <div className="flex items-center mt-1">
                                <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                  {shortenAddress(transfer.address || '')}
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(transfer.address || '');
                                  }}
                                  className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                  title="Copy contract address"
                                >
                                  {copiedAddresses[transfer.address || ''] ? (
                                    <Check size={12} className="text-green-400" />
                                  ) : (
                                    <Copy size={12} className="text-white/70 hover:text-white" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col space-y-1 text-xs">
                              <a 
                                href={`https://dexscreener.com/pulsechain/${transfer.address}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                DexScreener
                              </a>
                              <a 
                                href={`https://otter.pulsechain.com/address/${transfer.address}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                Otterscan
                              </a>
                              <a 
                                href={`https://scan.pulsechain.com/token/${transfer.address}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                PulseScan
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                        <Link 
                          to={`/${transfer.direction === 'receive' ? transfer.from_address : transfer.to_address}`} 
                          className="text-white hover:text-gray-300"
                                target="_blank"
                                rel="noopener noreferrer"
                        >
                          {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)}
                    </div>
                    {(() => {
                      const tokenAddress = (transfer.address || '').toLowerCase();
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
                </div>
              ))}
              
              {/* Native Transfers */}
              {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                <div key={`mobile-${tx.hash}-native-${i}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center">
                    <img 
                      src="/assets/pls-logo-trimmed.png"
                      alt="PLS"
                      className="w-6 h-6 rounded-full object-cover border border-white/10"
                    />
                    <div className="ml-2">
                      <div className="flex items-center">
                        {transfer.direction === 'receive' ? (
                          <ArrowDownLeft size={14} className="text-green-400 mr-1" />
                        ) : (
                          <ArrowUpRight size={14} className="text-red-400 mr-1" />
                        )}
                        <div className="group relative">
                          <span className="text-sm font-medium border-b border-dotted border-white/30" title={transfer.token_symbol || 'PLS'}>
                            {(transfer.token_symbol && transfer.token_symbol.length > 15) 
                              ? `${transfer.token_symbol.substring(0, 15)}...` 
                              : (transfer.token_symbol || 'PLS')}
                          </span>
                          <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                            <div className="mb-2 text-xs">
                              <span className="text-muted-foreground">Type:</span>
                              <div className="flex items-center mt-1">
                                <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                  Native Token
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
                                  }}
                                  className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                  title="Copy PLS token address"
                                >
                                  {copiedAddresses['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] ? (
                                    <Check size={12} className="text-green-400" />
                                  ) : (
                                    <Copy size={12} className="text-white/70 hover:text-white" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col space-y-1 text-xs">
                              <a 
                                href="https://dexscreener.com/pulsechain/0x8a810ea8B121d08342E9e7696f4a9915cBE494B7" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                DexScreener
                              </a>
                              <a 
                                href="https://otter.pulsechain.com" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200 mb-1"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                Otterscan
                              </a>
                              <a 
                                href="https://scan.pulsechain.com" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center bg-black/50 border border-white/20 rounded-md px-2 py-1 text-white hover:bg-black/80 hover:border-white/40 transition-all duration-200"
                              >
                                <ExternalLink size={10} className="mr-1" />
                                PulseScan
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                        <Link 
                          to={`/${transfer.direction === 'receive' ? transfer.from_address : transfer.to_address}`} 
                          className="text-white hover:text-gray-300"
                                target="_blank"
                                rel="noopener noreferrer"
                        >
                          {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value)}
                    </div>
                    {(() => {
                      const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
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
                </div>
              ))}
              
              {/* Gas Fee */}
              <div className="text-xs font-semibold text-white mt-2 text-right">
                Gas: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
                {(() => {
                  const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                  const hasBatchPrice = !!batchPrices[plsAddress];
                  const usdValue = calculateUsdValue(tx.transaction_fee.toString(), '18', plsAddress);
                  
                  return usdValue ? (
                    <span className="ml-2 flex items-center">
                      ({usdValue.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 2,
                        minimumFractionDigits: 2
                      })})
                      {hasBatchPrice && <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">✓</span>}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Load More Button (if there are more transactions) */}
      {hasMore && (
        <div className="p-6 flex flex-col items-center">
          {loadingTimeout && isLoadingMore && (
            <div className="mb-4 px-4 py-3 glass-card border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 rounded-md max-w-md text-center">
              <p className="text-sm mb-2">
                The request is taking longer than expected. This may be due to:
              </p>
              <ul className="text-xs text-left list-disc pl-5 mb-2">
                <li>Moralis API rate limits (100 transactions per request)</li>
                <li>Network congestion on PulseChain</li>
                <li>Server-side timeouts</li>
              </ul>
              <p className="text-xs">You can wait or try again.</p>
            </div>
          )}
          
          <button 
            onClick={() => {
              if (loadingTimeout) {
                // If in timeout state, clear it and retry
                setLoadingTimeout(false);
                if (requestTimeoutId) clearTimeout(requestTimeoutId);
                loadMoreTransactions();
              } else {
                // Normal load more
                loadMoreTransactions();
              }
            }}
            disabled={isLoadingMore && !loadingTimeout}
            className="w-full max-w-md flex items-center justify-center px-3 py-2 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore && !loadingTimeout ? (
              <span className="flex items-center">
                <Loader2 size={18} className="mr-2 animate-spin text-white" /> 
                Loading more transactions...
              </span>
            ) : isLoadingMore && loadingTimeout ? (
              <span className="flex items-center">
                <RefreshCw size={18} className="mr-2" /> 
                Try Again
              </span>
            ) : (
              <span className="flex items-center">
                <ChevronDown size={18} className="mr-2" /> 
                Load More Transactions
              </span>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}