import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw, Filter, Plus, Copy, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { formatDate, shortenAddress } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
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
  // First check if there are both send and receive transfers in the same transaction
  // This pattern strongly indicates a swap transaction
  const hasSendTransfers = tx.erc20_transfers?.some(t => t.direction === 'send');
  const hasReceiveTransfers = tx.erc20_transfers?.some(t => t.direction === 'receive');
  
  // If we have at least one send and one receive in the same transaction, it's likely a swap
  if (hasSendTransfers && hasReceiveTransfers && tx.erc20_transfers && tx.erc20_transfers.length >= 2) {
    return 'swap';
  }
  
  // Check method labels that indicate swaps
  const swapMethodSignatures = ['swap', 'trade', 'multicall', 'exactinput', 'exactoutput'];
  if (tx.method_label && swapMethodSignatures.some(sig => tx.method_label?.toLowerCase().includes(sig))) {
    return 'swap';
  }
  
  // If a category is provided, use it
  if (tx.category) {
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
  }
  
  // Try to infer from other properties if category is not available
  if (tx.method_label?.toLowerCase().includes('approve')) {
    return 'approval';
  } else if (tx.erc20_transfers && tx.erc20_transfers.some(t => t.from_address.toLowerCase() === t.to_address.toLowerCase())) {
    return 'contract'; // Self-transfers are often contract interactions
  } else if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
    // If we only have one direction of transfers, determine if it's send or receive
    if (hasSendTransfers && !hasReceiveTransfers) {
      return 'send';
    } else if (hasReceiveTransfers && !hasSendTransfers) {
      return 'receive';
    }
    return 'send'; // Default for token transfers
  }
  
  return 'all'; // Default fallback
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
  
  // Add state for token filter
  const [tokenFilter, setTokenFilter] = useState<string>('');
  
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
      }, 20000); // 20 seconds timeout
      
      setRequestTimeoutId(timeoutId);
      setLoadingTimeout(false);
      
      try {
        // Use the actual wallet address (not the token address)
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
        
        // Process the response data to add direction property to transfers
        const processedTransactions = (response.result || []).map(tx => {
          // Process ERC20 transfers to add direction
          if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
            // Use type assertion for TransactionTransfer
            tx.erc20_transfers = tx.erc20_transfers.map((transfer: any) => {
              // Set direction based on from/to addresses
              const isReceiving = transfer.to_address.toLowerCase() === walletAddress.toLowerCase();
              const isSending = transfer.from_address.toLowerCase() === walletAddress.toLowerCase();
              
              return {
                ...transfer,
                direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
              };
            });
          }
          
          // Process native transfers to add direction
          if (tx.native_transfers && tx.native_transfers.length > 0) {
            // Use type assertion for TransactionTransfer
            tx.native_transfers = tx.native_transfers.map((transfer: any) => {
              // Set direction based on from/to addresses
              const isReceiving = transfer.to_address.toLowerCase() === walletAddress.toLowerCase();
              const isSending = transfer.from_address.toLowerCase() === walletAddress.toLowerCase();
              
              return {
                ...transfer,
                direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
              };
            });
          }
          
          return tx;
        });
        
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
    }, 20000); // 20 seconds timeout
    
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
        // Process the additional transactions
        const processedTransactions = moreData.result.map(tx => {
          // Process ERC20 transfers to add direction
          if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
            tx.erc20_transfers = tx.erc20_transfers.map((transfer: any) => {
              // Set direction based on from/to addresses
              const isReceiving = transfer.to_address.toLowerCase() === walletAddress.toLowerCase();
              const isSending = transfer.from_address.toLowerCase() === walletAddress.toLowerCase();
              
              return {
                ...transfer,
                direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
              };
            });
          }
          
          // Process native transfers to add direction
          if (tx.native_transfers && tx.native_transfers.length > 0) {
            tx.native_transfers = tx.native_transfers.map((transfer: any) => {
              // Set direction based on from/to addresses
              const isReceiving = transfer.to_address.toLowerCase() === walletAddress.toLowerCase();
              const isSending = transfer.from_address.toLowerCase() === walletAddress.toLowerCase();
              
              return {
                ...transfer,
                direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
              };
            });
          }
          
          return tx;
        });
        
        // Append new processed transactions to existing list
        setTransactions(prev => [...prev, ...processedTransactions]);
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

  // Debug logging flag - set to false to disable all logging
  const DEBUG_LOGGING = false;
  
  // Debug log function to centralize control of logging
  const debugLog = (message: string, ...args: any[]) => {
    if (DEBUG_LOGGING) {
      console.log(message, ...args);
    }
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

  // Helper function to consolidate swap transfers of the same token
  const consolidateSwapTransfers = (tx: Transaction): Transaction => {
    // Only process swap transactions with multiple ERC20 transfers
    if (getTransactionType(tx) !== 'swap' || !tx.erc20_transfers || tx.erc20_transfers.length <= 1) {
      return tx;
    }
  
    // New list for consolidated transfers
    const consolidatedTransfers: TransactionTransfer[] = [];
    
    // Create a map to group transfers by token address and direction
    const transferMap: Record<string, TransactionTransfer> = {};
    
    // Track swap router addresses for later reference
    const routerAddresses = new Set<string>();
    
    // Process all transfers to combine by token and direction
    tx.erc20_transfers.forEach(transfer => {
      // Create a key combining token address and direction
      const tokenAddress = (transfer.address || '').toLowerCase();
      const direction = transfer.direction || 'unknown';
      
      // Skip LP token deposits/withdrawals and unknown directions to better isolate the true swap tokens
      if (
        (transfer.token_symbol && 
         (transfer.token_symbol.includes('LP') || 
          transfer.token_symbol.toLowerCase().includes('lp') || 
          transfer.token_symbol.includes('PulseX'))) ||
        direction === 'unknown'
      ) {
        return; // Skip this transfer as it's likely intermediate
      }
            
      // If this is a transfer to/from a router contract, note the router address
      // This helps us identify the primary swap tokens vs intermediary tokens
      if (transfer.to_address && transfer.to_address.includes('Router')) {
        routerAddresses.add(transfer.to_address.toLowerCase());
      }
      if (transfer.from_address && transfer.from_address.includes('Router')) {
        routerAddresses.add(transfer.from_address.toLowerCase());
      }
      
      const key = `${tokenAddress}-${direction}`;
      
      if (transferMap[key]) {
        // If we already have this token+direction, add the values
        const existingTransfer = transferMap[key];
        const existingValue = BigInt(existingTransfer.value || '0');
        const newValue = BigInt(transfer.value || '0');
        const totalValue = (existingValue + newValue).toString();
        
        // Calculate formatted value properly
        let formattedValue: string | undefined = undefined;
        if (transfer.token_decimals) {
          try {
            // Handle large numbers more carefully
            const decimalValue = Number(transfer.token_decimals);
            if (totalValue.length > 15) {
              // Parse with decimal point to avoid JS number precision issues
              const integerPart = totalValue.substring(0, totalValue.length - decimalValue) || '0';
              const decimalPart = totalValue.substring(totalValue.length - decimalValue) || '0';
              formattedValue = `${integerPart}.${decimalPart}`;
            } else {
              formattedValue = (Number(totalValue) / 10 ** decimalValue).toFixed(6);
            }
          } catch (e) {
            console.warn('Error formatting token value:', e);
          }
        }
        
        // Update the value in the map
        transferMap[key] = {
          ...existingTransfer,
          value: totalValue,
          value_formatted: formattedValue
        };
      } else {
        // First occurrence of this token+direction
        // Format the value properly
        let formattedValue = transfer.value_formatted;
        if (!formattedValue && transfer.token_decimals && transfer.value) {
          try {
            const decimalValue = Number(transfer.token_decimals);
            const valueStr = transfer.value;
            
            if (valueStr.length > 15) {
              // Parse with decimal point to avoid JS number precision issues
              const integerPart = valueStr.substring(0, valueStr.length - decimalValue) || '0';
              const decimalPart = valueStr.substring(valueStr.length - decimalValue).padEnd(decimalValue, '0') || '0';
              formattedValue = `${integerPart}.${decimalPart}`;
            } else {
              formattedValue = (Number(valueStr) / 10 ** decimalValue).toFixed(6);
            }
          } catch (e) {
            console.warn('Error formatting token value:', e);
          }
        }
        
        transferMap[key] = {
          ...transfer,
          value_formatted: formattedValue
        };
      }
    });
    
    // Convert map back to array
    for (const key in transferMap) {
      consolidatedTransfers.push(transferMap[key]);
    }
    
    // Return the transaction with consolidated transfers
    return {
      ...tx,
      erc20_transfers: consolidatedTransfers
    };
  };
  
  // Apply consolidation to transactions with multiple swap transfers of the same token
  const processedTransactions = transactions.map(tx => {
    return consolidateSwapTransfers(tx);
  });
  
  // Filter transactions based on selected type and token filter
  const filteredTransactions = processedTransactions.filter(tx => {
    // First filter by transaction type
    const typeMatches = selectedType === 'all' || getTransactionType(tx) === selectedType;
    
    // Then filter by token name/symbol if a filter is applied
    if (!tokenFilter.trim()) {
      return typeMatches; // No token filter, just return type filter result
    }
    
    const searchTerm = tokenFilter.toLowerCase().trim();
    
    // Check ERC20 transfers
    const hasMatchingErc20 = tx.erc20_transfers?.some(transfer => 
      (transfer.token_symbol?.toLowerCase().includes(searchTerm)) ||
      (transfer.token_name?.toLowerCase().includes(searchTerm))
    );
    
    // Check native transfers (PLS)
    const hasMatchingNative = tx.native_transfers?.some(transfer => 
      (transfer.token_symbol?.toLowerCase().includes(searchTerm)) ||
      (transfer.token_name?.toLowerCase().includes(searchTerm)) ||
      'pls'.includes(searchTerm) ||
      'pulse'.includes(searchTerm)
    );
    
    const tokenMatches = hasMatchingErc20 || hasMatchingNative;
    
    return typeMatches && tokenMatches;
  });
  
  // Count transactions by type
  const transactionCounts = processedTransactions.reduce((counts, tx) => {
    const type = getTransactionType(tx);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  // Extract token addresses for logos and prices - memoized to prevent infinite loops
  // Using stringified JSON of transactions to ensure stable dependency
  const transactionsKey = useMemo(() => 
    transactions.map(tx => tx.hash).join(','), 
    [transactions]
  );
  
  // Memoize the token address extraction to prevent unnecessary processing
  const extractTokenAddresses = useMemo(() => {
    if (!processedTransactions || processedTransactions.length === 0) {
      return [];
    }
    
    // Use array instead of Set to avoid iteration issues
    const addresses: string[] = [];
    const seen = new Set<string>(); // For faster lookups
    
    const addUniqueAddress = (address: string) => {
      const normalizedAddress = address.toLowerCase();
      if (!seen.has(normalizedAddress)) {
        seen.add(normalizedAddress);
        addresses.push(normalizedAddress);
      }
    };
    
    processedTransactions.forEach((tx: Transaction) => {
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
    
    // DEBUG: Removed console.log that was causing console flooding
    return addresses;
  }, [transactionsKey, processedTransactions.length]);
  
  // Set visible token addresses once they're extracted - only if they change
  useEffect(() => {
    if (extractTokenAddresses.length > 0) {
      setVisibleTokenAddresses(prev => {
        // Only update if different
        if (prev.length !== extractTokenAddresses.length || 
            !prev.every((addr, i) => addr === extractTokenAddresses[i])) {
          return extractTokenAddresses;
        }
        return prev;
      });
    }
  }, [extractTokenAddresses]);

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
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Token Search Filter */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by token (e.g., solidx, hex, pls)"
                value={tokenFilter}
                onChange={(e) => setTokenFilter(e.target.value)}
                className="w-64 px-3 py-1.5 text-sm bg-black/40 border border-white/10 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-white/30 focus:bg-black/60 transition-all duration-200"
              />
              {tokenFilter && (
                <button
                  onClick={() => setTokenFilter('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
                >
                  ×
                </button>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200">
                  <Filter size={16} />
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
                    {(() => {
                      // If there's a summary provided by the API, use it
                      if (tx.summary) return tx.summary;
                      
                      // Generate a swap summary for consolidated transactions
                      if (getTransactionType(tx) === 'swap' && tx.erc20_transfers && tx.erc20_transfers.length >= 2) {
                        // Find send and receive transfers
                        const sendTransfers = tx.erc20_transfers.filter(t => t.direction === 'send');
                        const receiveTransfers = tx.erc20_transfers.filter(t => t.direction === 'receive');
                        
                        // If we have both send and receive tokens, it's a swap
                        if (sendTransfers.length > 0 && receiveTransfers.length > 0) {
                          // If there are multiple send or receive tokens, try to focus on the main ones
                          // For this case we'll prioritize tokens with proper symbols and skip LP tokens
                          const filteredSendTransfers = sendTransfers
                            .filter(t => t.token_symbol && 
                              !t.token_symbol.toLowerCase().includes('lp') && 
                              !t.token_symbol.toLowerCase().includes('pulsex'));
                          
                          const filteredReceiveTransfers = receiveTransfers
                            .filter(t => t.token_symbol && 
                              !t.token_symbol.toLowerCase().includes('lp') && 
                              !t.token_symbol.toLowerCase().includes('pulsex'));
                          
                          // Use filtered transfers if available, otherwise default to original
                          const effectiveSendTransfers = filteredSendTransfers.length > 0 ? 
                            filteredSendTransfers : sendTransfers;
                          
                          const effectiveReceiveTransfers = filteredReceiveTransfers.length > 0 ? 
                            filteredReceiveTransfers : receiveTransfers;
                          
                          // For multiple tokens of the same type, combine them in the description
                          if (effectiveSendTransfers.length > 1 || effectiveReceiveTransfers.length > 1) {
                            const sendParts = effectiveSendTransfers.map(transfer => {
                              const amount = transfer.value_formatted || 
                                formatTokenValue(transfer.value, transfer.token_decimals);
                              return `${amount} ${transfer.token_symbol || 'tokens'}`;
                            });
                            
                            const receiveParts = effectiveReceiveTransfers.map(transfer => {
                              const amount = transfer.value_formatted || 
                                formatTokenValue(transfer.value, transfer.token_decimals);
                              return `${amount} ${transfer.token_symbol || 'tokens'}`;
                            });
                            
                            const sendText = sendParts.join(' and ');
                            const receiveText = receiveParts.join(' and ');
                            
                            return `Swapped ${sendText} for ${receiveText}`;
                          } else {
                            // Simple case with one main send and one main receive token
                            const sendTransfer = effectiveSendTransfers[0];
                            const receiveTransfer = effectiveReceiveTransfers[0];
                            
                            // Format the amounts
                            const sendAmount = sendTransfer.value_formatted || 
                              formatTokenValue(sendTransfer.value, sendTransfer.token_decimals);
                            const receiveAmount = receiveTransfer.value_formatted || 
                              formatTokenValue(receiveTransfer.value, receiveTransfer.token_decimals);
                            
                            return `Swapped ${sendAmount} ${sendTransfer.token_symbol || 'tokens'} for ${receiveAmount} ${receiveTransfer.token_symbol || 'tokens'}`;
                          }
                        }
                      }
                      
                      // Default fallback
                      return 'Transaction details';
                    })()}
                    
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
                <td className="px-6 py-4 text-right">
                  {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-erc20-value-${i}`} className={`${i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'} flex flex-wrap justify-end`}>
                        <span className="break-all">
                          {transfer.direction === 'receive' ? '+' : '-'}
                          {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)}
                        </span>
                        <span className="ml-1 break-all">
                          {transfer.token_symbol && transfer.token_symbol.length > 6 
                            ? `${transfer.token_symbol.substring(0, 6)}...` 
                            : transfer.token_symbol}
                        </span>
                      </div>
                      {/* Add USD value display using batch token prices */}
                      {(() => {
                        const tokenAddress = (transfer.address || '').toLowerCase();
                        // Check if we have a price from our batch hook
                        const hasBatchPrice = !!batchPrices[tokenAddress];
                        const usdValue = calculateUsdValue(transfer.value, transfer.token_decimals, tokenAddress);
                        
                        return usdValue ? (
                          <div className="text-xs text-muted-foreground flex items-center justify-end">
                            {formatCurrency(usdValue)}
                            {hasBatchPrice && <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">✓</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                  
                  {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-native-value-${i}`} className={`${(tx.erc20_transfers && tx.erc20_transfers.length > 0) || i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'} flex flex-wrap justify-end`}>
                        <span className="break-all">
                          {transfer.direction === 'receive' ? '+' : '-'}
                          {transfer.value_formatted || formatTokenValue(transfer.value)}
                        </span>
                        <span className="ml-1">
                          {(transfer.token_symbol && transfer.token_symbol.length > 6) 
                            ? `${transfer.token_symbol.substring(0, 6)}...` 
                            : (transfer.token_symbol || 'PLS')}
                        </span>
                      </div>
                      {/* Add USD value display for native PLS token using batch token prices */}
                      {(() => {
                        const plsAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                        // Check if we have a price from our batch hook
                        const hasBatchPrice = !!batchPrices[plsAddress];
                        const usdValue = calculateUsdValue(transfer.value, '18', plsAddress);
                        
                        return usdValue ? (
                          <div className="text-xs text-muted-foreground flex items-center justify-end">
                            {formatCurrency(usdValue)}
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
                          {formatCurrency(usdValue)}
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
              
              {/* Generate a swap summary for consolidated transactions */}
              {!tx.summary && getTransactionType(tx) === 'swap' && tx.erc20_transfers && tx.erc20_transfers.length >= 2 && (
                <div className="mb-2 text-sm font-medium">
                  {(() => {
                    // Find send and receive transfers
                    const sendTransfers = tx.erc20_transfers.filter(t => t.direction === 'send');
                    const receiveTransfers = tx.erc20_transfers.filter(t => t.direction === 'receive');
                    
                    // If we have both send and receive tokens, it's a swap
                    if (sendTransfers.length > 0 && receiveTransfers.length > 0) {
                      // If there are multiple send or receive tokens, try to focus on the main ones
                      // For this case we'll prioritize tokens with proper symbols and skip LP tokens
                      const filteredSendTransfers = sendTransfers
                        .filter(t => t.token_symbol && 
                          !t.token_symbol.toLowerCase().includes('lp') && 
                          !t.token_symbol.toLowerCase().includes('pulsex'));
                      
                      const filteredReceiveTransfers = receiveTransfers
                        .filter(t => t.token_symbol && 
                          !t.token_symbol.toLowerCase().includes('lp') && 
                          !t.token_symbol.toLowerCase().includes('pulsex'));
                      
                      // Use filtered transfers if available, otherwise default to original
                      const effectiveSendTransfers = filteredSendTransfers.length > 0 ? 
                        filteredSendTransfers : sendTransfers;
                      
                      const effectiveReceiveTransfers = filteredReceiveTransfers.length > 0 ? 
                        filteredReceiveTransfers : receiveTransfers;
                      
                      // For multiple tokens of the same type, combine them in the description
                      if (effectiveSendTransfers.length > 1 || effectiveReceiveTransfers.length > 1) {
                        const sendParts = effectiveSendTransfers.map(transfer => {
                          const amount = transfer.value_formatted || 
                            formatTokenValue(transfer.value, transfer.token_decimals);
                          return `${amount} ${transfer.token_symbol || 'tokens'}`;
                        });
                        
                        const receiveParts = effectiveReceiveTransfers.map(transfer => {
                          const amount = transfer.value_formatted || 
                            formatTokenValue(transfer.value, transfer.token_decimals);
                          return `${amount} ${transfer.token_symbol || 'tokens'}`;
                        });
                        
                        const sendText = sendParts.join(' and ');
                        const receiveText = receiveParts.join(' and ');
                        
                        return `Swapped ${sendText} for ${receiveText}`;
                      } else {
                        // Simple case with one main send and one main receive token
                        const sendTransfer = effectiveSendTransfers[0];
                        const receiveTransfer = effectiveReceiveTransfers[0];
                        
                        // Format the amounts
                        const sendAmount = sendTransfer.value_formatted || 
                          formatTokenValue(sendTransfer.value, sendTransfer.token_decimals);
                        const receiveAmount = receiveTransfer.value_formatted || 
                          formatTokenValue(receiveTransfer.value, receiveTransfer.token_decimals);
                        
                        return `Swapped ${sendAmount} ${sendTransfer.token_symbol || 'tokens'} for ${receiveAmount} ${receiveTransfer.token_symbol || 'tokens'}`;
                      }
                    }
                    return null;
                  })()}
                </div>
              )}
              
              {/* ERC20 Transfers */}
              {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                <div key={`mobile-${tx.hash}-erc20-${i}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center max-w-[65%]">
                    <TokenLogo 
                      address={transfer.address || ''}
                      symbol={transfer.token_symbol || ''}
                      fallbackLogo={prefetchedLogos[transfer.address?.toLowerCase() || '']}
                      size="sm"
                    />
                    <div className="ml-2 min-w-0">
                      <div className="flex items-center">
                        {transfer.direction === 'receive' ? (
                          <ArrowDownLeft size={14} className="text-green-400 mr-1 flex-shrink-0" />
                        ) : (
                          <ArrowUpRight size={14} className="text-red-400 mr-1 flex-shrink-0" />
                        )}
                        <div className="group relative overflow-hidden">
                          <span className="text-sm font-medium border-b border-dotted border-white/30 truncate block" title={transfer.token_symbol}>
                            {transfer.token_symbol && transfer.token_symbol.length > 8
                              ? `${transfer.token_symbol.substring(0, 8)}...` 
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
                          {formatCurrency(usdValue)}
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
                  <div className="flex items-center max-w-[65%]">
                    <img 
                      src="/assets/pls-logo-trimmed.png"
                      alt="PLS"
                      className="w-6 h-6 rounded-full object-cover border border-white/10 flex-shrink-0"
                    />
                    <div className="ml-2 min-w-0">
                      <div className="flex items-center">
                        {transfer.direction === 'receive' ? (
                          <ArrowDownLeft size={14} className="text-green-400 mr-1 flex-shrink-0" />
                        ) : (
                          <ArrowUpRight size={14} className="text-red-400 mr-1 flex-shrink-0" />
                        )}
                        <div className="group relative overflow-hidden">
                          <span className="text-sm font-medium border-b border-dotted border-white/30 truncate block" title={transfer.token_symbol || 'PLS'}>
                            {(transfer.token_symbol && transfer.token_symbol.length > 8) 
                              ? `${transfer.token_symbol.substring(0, 8)}...` 
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
                          {formatCurrency(usdValue)}
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