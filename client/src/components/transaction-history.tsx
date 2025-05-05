import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw, Filter, Plus, Copy, Check, Activity as ActivityIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { formatDate, shortenAddress } from '@/lib/utils';
import { Link } from 'wouter';
import { useTokenDataPrefetch } from '@/hooks/use-token-data-prefetch';
import { useBatchTokenPrices } from '@/hooks/use-batch-token-prices';
import { ethers } from 'ethers';
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

// Approval in contract interactions
interface TokenApproval {
  value: string;
  value_formatted: string;
  token: {
    address: string;
    address_label: string | null;
    token_name: string;
    token_logo: string;
    token_symbol: string;
  };
  spender: {
    address: string;
    address_label: string | null;
  };
}

// Contract interactions
interface ContractInteractions {
  approvals?: TokenApproval[];
}

interface Transaction {
  hash: string;
  nonce: string;
  transaction_index: string;
  from_address: string;
  from_address_label?: string | null;
  from_address_entity?: any | null;
  from_address_entity_logo?: string | null;
  to_address: string;
  to_address_label?: string | null;
  to_address_entity?: any | null;
  to_address_entity_logo?: string | null;
  value: string;
  gas: string;
  gas_price: string;
  receipt_gas_used: string;
  receipt_status: string;
  receipt_cumulative_gas_used?: string;
  receipt_contract_address?: string | null;
  block_timestamp: string;
  block_number: string;
  block_hash?: string;
  transaction_fee: string;
  method_label?: string;
  erc20_transfers?: TransactionTransfer[];
  native_transfers?: TransactionTransfer[];
  nft_transfers?: any[];
  contract_interactions?: ContractInteractions;
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
  // Safety check for the tx object
  if (!tx || typeof tx !== 'object') {
    return 'all';
  }

  // Track if the transaction appears to be a swap
  let isSwap = false;
  
  // Check based on category if available
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
  
  // Check summary field for swap-related terms
  if (tx.summary && typeof tx.summary === 'string') {
    const summary = tx.summary.toLowerCase();
    if (summary.includes('swap') || summary.includes('trade') || 
        summary.includes('exchange') || summary.includes('router')) {
      isSwap = true;
    }
  }
  
  // Check method label for swap-related terms
  if (tx.method_label && typeof tx.method_label === 'string') {
    const methodLabel = tx.method_label.toLowerCase();
    if (methodLabel.includes('swap') || 
        methodLabel.includes('exact') || 
        methodLabel.includes('router') || 
        methodLabel.includes('trade') || 
        methodLabel.includes('exchange')) {
      isSwap = true;
    }
    
    // Check for approvals
    if (methodLabel.includes('approve')) {
      return 'approval';
    }
  }
  
  // Common DEX router addresses
  const routerAddresses = [
    '0x165c3410fca3a132cead4881f9525d95a48f9cdd', // PulseX V2 Router
    '0xbd5c7c6ff7e05aff649b0a028f9e84731aebe609', // PulseX V1 Router
    '0x5dd6c8ab0e45c9dceae45e685e19745d75134182', // Another DEX Router
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'  // Uniswap V2 Router
  ];
  
  // Check if the transaction is to a known router
  if (tx.to_address && routerAddresses.includes(tx.to_address.toLowerCase())) {
    isSwap = true;
  }
  
  // Analyze ERC20 transfers
  if (tx.erc20_transfers && Array.isArray(tx.erc20_transfers) && tx.erc20_transfers.length > 0) {
    // Check for swap patterns (sending one token and receiving another)
    const sendTokens = tx.erc20_transfers.filter(t => 
      t.direction === 'send' || 
      t.from_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    const receiveTokens = tx.erc20_transfers.filter(t => 
      t.direction === 'receive' || 
      t.to_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    // Classic swap: sending one token and receiving another
    if (sendTokens.length > 0 && receiveTokens.length > 0) {
      isSwap = true;
    } else if (sendTokens.length > 0 && receiveTokens.length === 0) {
      // Only sending tokens, not a swap
      return 'send';
    } else if (receiveTokens.length > 0 && sendTokens.length === 0) {
      // Only receiving tokens, not a swap
      return 'receive';
    }
    
    // Check for self-transfers, which are often contract interactions
    if (tx.erc20_transfers.some(t => 
      t.from_address.toLowerCase() === t.to_address.toLowerCase()
    )) {
      return 'contract';
    }
  }
  
  // Return the final transaction type
  if (isSwap) {
    return 'swap';
  }
  
  // Default to contract interaction if we couldn't determine a more specific type
  return 'contract';
};

// Helper function to identify token in and token out in a swap transaction
const getSwapTokens = (tx: Transaction): { tokenIn?: TransactionTransfer, tokenOut?: TransactionTransfer } => {
  // Extra safety checks to avoid 'length of undefined' errors
  if (!tx || !tx.erc20_transfers || !Array.isArray(tx.erc20_transfers)) {
    return {};
  }
  
  // Make sure each transfer has the necessary properties before filtering
  const validTransfers = tx.erc20_transfers.filter(t => (
    t && 
    typeof t === 'object' && 
    t.from_address && 
    t.to_address && 
    (t.direction || t.from_address !== t.to_address) // Must have direction or be a non-self transfer
  ));
  
  if (validTransfers.length < 1) {
    return {};
  }
  
  // Find tokens sent by the transaction initiator (tokenIn)
  const sendTokens = validTransfers.filter(t => 
    t.direction === 'send' || 
    (t.from_address.toLowerCase() === tx.from_address.toLowerCase() &&
     t.to_address.toLowerCase() !== tx.from_address.toLowerCase())
  );
  
  // Find tokens received by the transaction initiator (tokenOut)
  const receiveTokens = validTransfers.filter(t => 
    t.direction === 'receive' || 
    (t.to_address.toLowerCase() === tx.from_address.toLowerCase() &&
     t.from_address.toLowerCase() !== tx.from_address.toLowerCase())
  );
  
  // If we don't have explicit send/receive tokens, try to infer from the transaction flow
  if (sendTokens.length === 0 && receiveTokens.length === 0 && validTransfers.length >= 2) {
    // Find unique token addresses in the transfers
    const tokenAddresses = new Set<string>();
    validTransfers.forEach(t => {
      if (t.address) tokenAddresses.add(t.address.toLowerCase());
    });
    
    // If there are multiple tokens involved, it might be a swap
    if (tokenAddresses.size >= 2) {
      // Take the first transfer as tokenIn (sent token)
      // and the last transfer as tokenOut (received token)
      return {
        tokenIn: validTransfers[0],
        tokenOut: validTransfers[validTransfers.length - 1]
      };
    }
  }
  
  // Return token in and token out with additional safety checks
  return {
    tokenIn: sendTokens.length > 0 ? sendTokens[0] : undefined,
    tokenOut: receiveTokens.length > 0 ? receiveTokens[0] : undefined
  };
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
  
  // Add state for expanded transaction view to show detailed information
  const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null);
  
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
  
  // Extract token addresses for batch price fetching
  useEffect(() => {
    const addresses: string[] = [];
    
    transactions.forEach(tx => {
      // Add addresses from ERC20 transfers
      if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
        tx.erc20_transfers.forEach(transfer => {
          if (transfer.address && !addresses.includes(transfer.address.toLowerCase())) {
            addresses.push(transfer.address.toLowerCase());
          }
        });
      }
      
      // Add addresses from contract interactions (approvals)
      if (tx.contract_interactions?.approvals && tx.contract_interactions.approvals.length > 0) {
        tx.contract_interactions.approvals.forEach(approval => {
          if (approval.token.address && !addresses.includes(approval.token.address.toLowerCase())) {
            addresses.push(approval.token.address.toLowerCase());
          }
        });
      }
    });
    
    // Update state with unique addresses
    setVisibleTokenAddresses(addresses);
  }, [transactions]);

  // Use our custom hooks for data prefetching - one for logos, one for prices
  const { 
    logos: prefetchedLogos, 
    isLoading: isLogosPrefetching 
  } = useTokenDataPrefetch(walletAddress, visibleTokenAddresses || []);
  
  const {
    prices: batchPrices,
    isLoading: isPricesFetching
  } = useBatchTokenPrices(visibleTokenAddresses || []);
  
  // Calculate USD values for tokens based on batch prices
  const calculateUsdValue = useCallback((value: string, decimals: string = '18', tokenAddress?: string) => {
    if (!tokenAddress || !batchPrices[tokenAddress]) {
      return null;
    }
    
    const tokenPrice = batchPrices[tokenAddress];
    const decimalValue = parseInt(decimals);
    const tokenAmount = parseInt(value) / 10 ** decimalValue;
    
    return tokenAmount * tokenPrice;
  }, [batchPrices]);

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return formatDate(new Date(timestamp));
  };

  // Format value based on token decimals
  const formatTokenValue = (value: string, decimals: string = '18') => {
    const decimalValue = parseInt(decimals);
    return (parseInt(value) / 10 ** decimalValue).toFixed(decimalValue > 8 ? 4 : 2);
  };

  return (
    <Card className="h-full overflow-hidden glass-card border-white/10">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center">
          <Wallet className="mr-2 text-white/70" size={18} />
          <h2 className="text-lg font-semibold">Transaction History</h2>
        </div>
        
        <div className="flex items-center">
          <Button 
            onClick={() => refetch()}
            variant="outline" 
            size="sm"
            className="mr-2 text-xs bg-black/20 border-white/10 hover:bg-black/40"
          >
            {isLoading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Refresh
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="mr-2 text-xs bg-black/20 border-white/10 hover:bg-black/40"
              >
                <Filter className="mr-1 h-3 w-3" />
                {selectedType === 'all' ? 'All Types' : selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-black/80 backdrop-blur-md border-white/10 text-white">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem 
                className={`${selectedType === 'all' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('all')}
              >
                All Types
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`${selectedType === 'swap' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('swap')}
              >
                Swaps
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`${selectedType === 'send' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('send')}
              >
                Sends
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`${selectedType === 'receive' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('receive')}
              >
                Receives
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`${selectedType === 'approval' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('approval')}
              >
                Approvals
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`${selectedType === 'contract' ? 'bg-white/10' : ''} cursor-pointer hover:bg-white/20`}
                onClick={() => setSelectedType('contract')}
              >
                Contract Interactions
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button 
            onClick={onClose}
            variant="ghost" 
            size="sm"
            className="text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            Close
          </Button>
        </div>
      </div>
      
      <div className="p-0 h-[calc(100%-56px)] overflow-auto">
        {isLoading && !transactions.length ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <Loader2 className="h-8 w-8 animate-spin text-white/50 mb-4" />
            <p className="text-white/70">Loading transaction history...</p>
            
            {loadingTimeout && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md max-w-md">
                <p className="text-yellow-300 text-sm">
                  Loading is taking longer than expected. This could be due to high network traffic or a large transaction history.
                </p>
              </div>
            )}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-md max-w-md">
              <p className="text-red-300 mb-2 font-medium">Failed to load transaction history</p>
              <p className="text-white/70 text-sm">
                There was an error retrieving the transaction data. This could be due to network issues or API limitations.
              </p>
              <Button 
                onClick={() => refetch()}
                variant="outline" 
                size="sm"
                className="mt-4 text-xs bg-black/20 border-white/10 hover:bg-black/40"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Try Again
              </Button>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-md max-w-md text-center">
              <p className="text-blue-300 mb-2 font-medium">No transactions found</p>
              <p className="text-white/70 text-sm">
                This address doesn't have any recorded transactions in its history.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Filter transactions by selected type */}
            {transactions
              .filter(tx => selectedType === 'all' || getTransactionType(tx) === selectedType)
              .map((tx, index) => (
                <div key={tx.hash + index} className="mb-4 glass-card border border-white/10 rounded-md overflow-hidden">
                  {/* Transaction Header - Common for all types */}
                  <div className="p-3 border-b border-white/10 flex md:flex-row flex-col md:items-center justify-between bg-gradient-to-r from-black/30 to-transparent">
                    <div className="flex items-center mb-2 md:mb-0">
                      <div className="flex-shrink-0">
                        {(() => {
                          const type = getTransactionType(tx);
                          
                          // Map transaction types to appropriate indicators
                          switch (type) {
                            case 'swap':
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                    <path d="m17 4 3 3-3 3"></path><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3.6 3.6"></path>
                                    <path d="m7 20-3-3 3-3"></path><path d="M20.4 3.6 15 9"></path><path d="m15 13 5.3 5.3"></path><path d="m4 13 7 7"></path>
                                  </svg>
                                </div>
                              );
                            case 'send':
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40">
                                  <ArrowUpRight size={16} className="text-red-400" />
                                </div>
                              );
                            case 'receive':
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40">
                                  <ArrowDownLeft size={16} className="text-green-400" />
                                </div>
                              );
                            case 'approval':
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                                    <polyline points="22 12 16 12"></polyline><path d="M16 16h-4a2 2 0 0 1-2-2V8"></path>
                                    <path d="M8 12H2"></path><path d="M12 3v4"></path><path d="M12 21v-4"></path>
                                  </svg>
                                </div>
                              );
                            case 'contract':
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                                    <path d="M12 3v19"></path><path d="M5 7v8"></path><path d="M19 7v8"></path>
                                    <path d="M5 7h14"></path><path d="M5 15h14"></path>
                                  </svg>
                                </div>
                              );
                            default:
                              return (
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-500/20 border border-gray-500/40">
                                  <ActivityIcon size={16} className="text-gray-400" />
                                </div>
                              );
                          }
                        })()}
                      </div>
                      
                      <div className="ml-3">
                        <div className="flex items-center">
                          <h3 className="font-medium mr-3">
                            {(() => {
                              const type = getTransactionType(tx);
                              
                              // Show different titles based on transaction type
                              switch (type) {
                                case 'swap':
                                  return 'Swap Transaction';
                                case 'send':
                                  return 'Send Transaction';
                                case 'receive':
                                  return 'Receive Transaction';
                                case 'approval':
                                  return 'Token Approval';
                                case 'contract':
                                  return 'Contract Interaction';
                                default:
                                  return 'Transaction';
                              }
                            })()}
                          </h3>
                          
                          {/* Status badge */}
                          {tx.receipt_status === '1' ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">Success</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">Failed</span>
                          )}
                          
                          {/* Method label */}
                          {tx.method_label && (
                            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-300">{tx.method_label}</span>
                          )}
                          
                          {/* Spam warning */}
                          {tx.possible_spam && (
                            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400">Possible Spam</span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-400 mt-1">
                          {formatTimestamp(tx.block_timestamp)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:items-end">
                      <div className="flex items-center mb-2 md:mb-0">
                        <a 
                          href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-white/70 hover:text-white flex items-center mr-3 underline-offset-2 hover:underline"
                        >
                          <ExternalLink size={12} className="mr-1" />
                          View on Explorer
                        </a>
                        
                        <button
                          onClick={() => copyToClipboard(tx.hash)}
                          className="text-sm text-white/70 hover:text-white flex items-center"
                          title="Copy transaction hash"
                        >
                          {copiedAddresses[tx.hash] ? (
                            <Check size={14} className="text-green-400" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                      
                      {/* Expanded view toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedTransaction(expandedTransaction === tx.hash ? null : tx.hash)}
                        className="text-xs flex items-center justify-center hover:bg-black/20 text-white/70 hover:text-white px-2 py-1 h-auto"
                      >
                        {expandedTransaction === tx.hash ? 'Hide Details' : 'Show Details'}
                        <ChevronDown
                          size={14}
                          className={`ml-1 transition-transform ${expandedTransaction === tx.hash ? 'rotate-180' : ''}`}
                        />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Expanded Transaction Details - Advanced View for all transaction data */}
                  {expandedTransaction === tx.hash && (
                    <div className="p-3 border-b border-white/10 bg-gradient-to-b from-black/10 to-transparent">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex justify-between items-center px-2 py-1.5">
                          <span className="text-white/70">Hash:</span>
                          <div className="flex items-center">
                            <span className="text-white truncate max-w-[150px]">{tx.hash}</span>
                            <button 
                              onClick={() => copyToClipboard(tx.hash)}
                              className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                            >
                              {copiedAddresses[tx.hash] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} className="text-white/70 hover:text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                          <span className="text-white/70">Block:</span>
                          <div className="flex items-center">
                            <span className="text-white truncate max-w-[150px]">{tx.block_number}</span>
                            <button 
                              onClick={() => copyToClipboard(tx.block_number)}
                              className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                            >
                              {copiedAddresses[tx.block_number] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} className="text-white/70 hover:text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        {tx.block_hash && (
                          <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                            <span className="text-white/70">Block Hash:</span>
                            <div className="flex items-center">
                              <span className="text-white truncate max-w-[100px]">{tx.block_hash}</span>
                              {tx.block_hash && (
                                <button 
                                  onClick={() => copyToClipboard(tx.block_hash as string)}
                                  className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                >
                                  {tx.block_hash && copiedAddresses[tx.block_hash] ? (
                                    <Check size={12} className="text-green-400" />
                                  ) : (
                                    <Copy size={12} className="text-white/70 hover:text-white" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {tx.transaction_index && (
                          <div className="flex justify-between items-center px-2 py-1.5">
                            <span className="text-white/70">Tx Index:</span>
                            <span className="text-white">{tx.transaction_index}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                          <span className="text-white/70">From:</span>
                          <div className="flex items-center">
                            <Link 
                              to={`/${tx.from_address}`}
                              className="text-white hover:text-gray-300"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {shortenAddress(tx.from_address)}
                            </Link>
                            {(tx.from_address_label || tx.from_address_entity) && (
                              <span className="ml-1 px-1 py-0.5 bg-yellow-500/20 text-xs rounded-md text-yellow-300">
                                {tx.from_address_label || (tx.from_address_entity ? tx.from_address_entity.name : null)}
                              </span>
                            )}
                            {tx.from_address_entity_logo && (
                              <img 
                                src={tx.from_address_entity_logo} 
                                alt="Entity Logo" 
                                className="ml-1 w-4 h-4 rounded-full"
                              />
                            )}
                            <button 
                              onClick={() => copyToClipboard(tx.from_address)}
                              className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                            >
                              {copiedAddresses[tx.from_address] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} className="text-white/70 hover:text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center px-2 py-1.5">
                          <span className="text-white/70">To:</span>
                          <div className="flex items-center">
                            <Link 
                              to={`/${tx.to_address}`}
                              className="text-white hover:text-gray-300"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {shortenAddress(tx.to_address)}
                            </Link>
                            {(tx.to_address_label || tx.to_address_entity) && (
                              <span className="ml-1 px-1 py-0.5 bg-yellow-500/20 text-xs rounded-md text-yellow-300">
                                {tx.to_address_label || (tx.to_address_entity ? tx.to_address_entity.name : null)}
                              </span>
                            )}
                            {tx.to_address_entity_logo && (
                              <img 
                                src={tx.to_address_entity_logo} 
                                alt="Entity Logo" 
                                className="ml-1 w-4 h-4 rounded-full"
                              />
                            )}
                            <button 
                              onClick={() => copyToClipboard(tx.to_address)}
                              className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                            >
                              {copiedAddresses[tx.to_address] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} className="text-white/70 hover:text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                          <span className="text-white/70">Value:</span>
                          <span className="text-white">{parseFloat(ethers.utils.formatEther(tx.value)) > 0 ? `${ethers.utils.formatEther(tx.value)} PLS` : '0 PLS'}</span>
                        </div>
                        
                        <div className="flex justify-between items-center px-2 py-1.5">
                          <span className="text-white/70">Gas Price:</span>
                          <span className="text-white">{(parseInt(tx.gas_price) / 10**9).toFixed(2)} Gwei</span>
                        </div>
                        
                        <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                          <span className="text-white/70">Gas Used:</span>
                          <span className="text-white">{parseInt(tx.receipt_gas_used).toLocaleString()}</span>
                        </div>
                        
                        {tx.receipt_cumulative_gas_used && (
                          <div className="flex justify-between items-center px-2 py-1.5">
                            <span className="text-white/70">Cumulative Gas:</span>
                            <span className="text-white">{parseInt(tx.receipt_cumulative_gas_used).toLocaleString()}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center px-2 py-1.5">
                          <span className="text-white/70">Gas Limit:</span>
                          <span className="text-white">{parseInt(tx.gas).toLocaleString()}</span>
                        </div>
                        
                        {tx.receipt_contract_address && (
                          <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                            <span className="text-white/70">Contract Created:</span>
                            <div className="flex items-center">
                              <Link 
                                to={`/${tx.receipt_contract_address || ''}`}
                                className="text-white hover:text-gray-300"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {tx.receipt_contract_address ? shortenAddress(tx.receipt_contract_address) : 'Unknown'}
                              </Link>
                              {tx.receipt_contract_address && (
                                <button 
                                  onClick={() => copyToClipboard(tx.receipt_contract_address as string)}
                                  className="ml-1 p-1 rounded-sm hover:bg-black/50 transition-colors"
                                >
                                  {tx.receipt_contract_address && copiedAddresses[tx.receipt_contract_address] ? (
                                    <Check size={12} className="text-green-400" />
                                  ) : (
                                    <Copy size={12} className="text-white/70 hover:text-white" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                          <span className="text-white/70">Transaction Fee:</span>
                          <span className="text-white">{parseFloat(tx.transaction_fee).toFixed(8)} PLS</span>
                        </div>
                        
                        <div className="flex justify-between items-center px-2 py-1.5">
                          <span className="text-white/70">Nonce:</span>
                          <span className="text-white">{tx.nonce}</span>
                        </div>
                        
                        {tx.method_label && (
                          <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                            <span className="text-white/70">Method:</span>
                            <span className="text-white">{tx.method_label}</span>
                          </div>
                        )}
                        
                        {tx.category && (
                          <div className="flex justify-between items-center px-2 py-1.5">
                            <span className="text-white/70">Category:</span>
                            <span className="text-white">{tx.category}</span>
                          </div>
                        )}
                        
                        {tx.possible_spam !== undefined && (
                          <div className="flex justify-between items-center bg-black/30 px-2 py-1.5 rounded-sm">
                            <span className="text-white/70">Possible Spam:</span>
                            <span className={tx.possible_spam ? 'text-red-400' : 'text-green-400'}>
                              {tx.possible_spam ? 'Yes' : 'No'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
            
                  {/* Swap Transaction Special Display - Mobile */}
                  {getTransactionType(tx) === 'swap' && (
                    <div className="mb-3 p-3 rounded-md glass-card border border-white/10 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <span className="bg-purple-500/20 px-2 py-0.5 rounded-md text-xs text-purple-300">
                            Swap
                          </span>
                        </div>
                      </div>
                      
                      {(() => {
                        // Added extra null/undefined check for tx before calling getSwapTokens
                        const { tokenIn, tokenOut } = tx ? getSwapTokens(tx) : { tokenIn: undefined, tokenOut: undefined };
                        
                        return (
                          <div className="flex flex-col space-y-2">
                            {/* Token In */}
                            {tokenIn && (
                              <div className="flex items-center justify-between p-2 bg-black/20 rounded-md">
                                <div className="flex items-center">
                                  <TokenLogo 
                                    address={tokenIn.address || ''}
                                    symbol={tokenIn.token_symbol || ''}
                                    fallbackLogo={tokenIn.token_logo || ''}
                                    size="sm"
                                  />
                                  <div className="ml-2">
                                    <div className="flex items-center">
                                      <ArrowUpRight size={12} className="text-red-400 mr-1" />
                                      <span className="text-sm font-medium">{tokenIn.token_symbol || 'Unknown'}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {tokenIn.address ? shortenAddress(tokenIn.address) : 'Unknown Address'}
                                    </div>
                                    {tokenIn.log_index !== undefined && (
                                      <div className="text-xs text-muted-foreground">
                                        Log Index: {tokenIn.log_index}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-red-400">
                                    -{tokenIn.value_formatted || formatTokenValue(tokenIn.value, tokenIn.token_decimals)}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Arrow */}
                            <div className="flex justify-center">
                              <div className="w-px h-4 bg-white/20"></div>
                            </div>
                            
                            {/* Token Out */}
                            {tokenOut && (
                              <div className="flex items-center justify-between p-2 bg-black/20 rounded-md">
                                <div className="flex items-center">
                                  <TokenLogo 
                                    address={tokenOut.address || ''}
                                    symbol={tokenOut.token_symbol || ''}
                                    fallbackLogo={tokenOut.token_logo || ''}
                                    size="sm"
                                  />
                                  <div className="ml-2">
                                    <div className="flex items-center">
                                      <ArrowDownLeft size={12} className="text-green-400 mr-1" />
                                      <span className="text-sm font-medium">{tokenOut.token_symbol || 'Unknown'}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {tokenOut.address ? shortenAddress(tokenOut.address) : 'Unknown Address'}
                                    </div>
                                    {tokenOut.log_index !== undefined && (
                                      <div className="text-xs text-muted-foreground">
                                        Log Index: {tokenOut.log_index}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-green-400">
                                    +{tokenOut.value_formatted || formatTokenValue(tokenOut.value, tokenOut.token_decimals)}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  
                  {/* Default transaction details when no transfers are available */}
                  {(!tx.erc20_transfers || tx.erc20_transfers.length === 0) && 
                   (!tx.native_transfers || tx.native_transfers.length === 0) && 
                   (!tx.contract_interactions?.approvals || tx.contract_interactions.approvals.length === 0) && (
                    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-black/20 border border-white/10">
                          <ActivityIcon size={14} className="text-white" />
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium">Contract Interaction</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            To: <Link 
                              to={`/${tx.to_address}`} 
                              className="text-white hover:text-gray-300"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {shortenAddress(tx.to_address)}
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {parseFloat(tx.value) > 0 && (
                            <div className="text-sm font-bold text-red-400">
                              -{ethers.utils.formatEther(tx.value)} PLS
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Contract Interactions - Approvals */}
                  {tx.contract_interactions?.approvals && tx.contract_interactions.approvals.map((approval, i) => (
                    <div key={`mobile-${tx.hash}-approval-${i}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 bg-blue-500/10 p-2 rounded-md mb-2">
                      <div className="flex items-center">
                        <TokenLogo 
                          address={approval.token.address}
                          symbol={approval.token.token_symbol}
                          fallbackLogo={approval.token.token_logo || prefetchedLogos[approval.token.address?.toLowerCase() || '']}
                          size="sm"
                        />
                        <div className="ml-2">
                          <div className="flex items-center">
                            <div className="flex flex-wrap">
                              <div className="bg-blue-400/20 px-1 py-0.5 rounded-sm text-xs text-blue-300 mr-1 mb-1">
                                Approve
                              </div>
                              <div className="bg-yellow-400/20 px-1 py-0.5 rounded-sm text-xs text-yellow-300 mr-1 mb-1" title="Token approvals grant permission to spend your tokens">
                                ⚠️ Security
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-sm">{approval.token.token_symbol}</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400">
                            Spender: {shortenAddress(approval.spender.address)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {approval.value_formatted}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* ERC20 Transfers */}
                  {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                    <div key={`mobile-${tx.hash}-erc20-${i}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center">
                        <TokenLogo 
                          address={transfer.address || ''}
                          symbol={transfer.token_symbol || ''}
                          fallbackLogo={transfer.token_logo || prefetchedLogos[transfer.address?.toLowerCase() || '']}
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
                                <span className="flex items-center">
                                  {transfer.token_symbol && transfer.token_symbol.length > 15 
                                    ? `${transfer.token_symbol.substring(0, 15)}...` 
                                    : transfer.token_symbol}
                                  {transfer.verified_contract && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-500/20 text-xs rounded-md text-green-400">✓</span>
                                  )}
                                  {transfer.security_score && transfer.security_score > 80 && (
                                    <span className="ml-1 px-1 py-0.5 bg-green-500/20 text-xs rounded-md text-green-400">Safe</span>
                                  )}
                                </span>
                              </span>
                              
                              {/* Tooltip with additional information */}
                              <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                                <div className="mb-2 text-xs">
                                  <span className="text-muted-foreground">Contract:</span>
                                  <div className="flex items-center mt-1">
                                    <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                      {transfer.address ? shortenAddress(transfer.address) : 'Unknown Address'}
                                    </span>
                                  </div>
                                  {transfer.log_index !== undefined && (
                                    <div className="flex items-center mt-2">
                                      <span className="text-muted-foreground">Log Index:</span>
                                      <span className="ml-1 bg-black/20 px-1 py-0.5 rounded text-white">
                                        {transfer.log_index}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center mt-2">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(transfer.address || '');
                                      }}
                                      className="p-1 rounded-sm hover:bg-black/50 transition-colors"
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
                          {transfer.log_index !== undefined && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Log Index: {transfer.log_index}
                            </div>
                          )}
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
                                <span className="flex items-center">
                                  {(transfer.token_symbol && transfer.token_symbol.length > 15) 
                                    ? `${transfer.token_symbol.substring(0, 15)}...` 
                                    : (transfer.token_symbol || 'PLS')}
                                  <span className="ml-1 px-1 py-0.5 bg-green-500/20 text-xs rounded-md text-green-400">Native</span>
                                  <span className="ml-1 px-1 py-0.5 bg-green-500/20 text-xs rounded-md text-green-400">Safe</span>
                                </span>
                              </span>
                              
                              {/* Native token tooltip */}
                              <div className="absolute left-0 top-full mt-0.5 opacity-0 invisible group-hover:visible group-hover:opacity-100 bg-black/80 backdrop-blur-md border border-white/10 rounded p-2 z-10 w-48 transition-all duration-200 ease-in-out transform origin-top-left group-hover:translate-y-0 translate-y-[-8px] pb-3 pt-3 px-3 before:content-[''] before:absolute before:top-[-10px] before:left-0 before:w-full before:h-[10px]">
                                <div className="mb-2 text-xs">
                                  <span className="text-muted-foreground">Type:</span>
                                  <div className="flex items-center mt-1">
                                    <span className="bg-black/20 px-1 py-0.5 rounded text-white">
                                      Native Token
                                    </span>
                                  </div>
                                  {transfer.log_index !== undefined && (
                                    <div className="flex items-center mt-2">
                                      <span className="text-muted-foreground">Log Index:</span>
                                      <span className="ml-1 bg-black/20 px-1 py-0.5 rounded text-white">
                                        {transfer.log_index}
                                      </span>
                                    </div>
                                  )}
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
                          {transfer.log_index !== undefined && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Log Index: {transfer.log_index}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                          {transfer.direction === 'receive' ? '+' : '-'}
                          {transfer.value_formatted || formatTokenValue(transfer.value)}
                        </div>
                        {(() => {
                          return (
                            <div className="text-xs text-muted-foreground flex items-center justify-end">
                              {(parseFloat(transfer.value) / 10**18 * 0.00002).toLocaleString('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 2,
                                minimumFractionDigits: 2
                              })}
                              <span className="ml-1 px-1 py-0.5 bg-gray-500/20 text-[9px] rounded text-gray-400">~</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              
              {/* Load More Button */}
              {hasMore && (
                <div className="flex justify-center mt-4">
                  <Button
                    onClick={loadMoreTransactions}
                    disabled={isLoadingMore}
                    variant="outline"
                    className="text-sm bg-black/20 border-white/10 hover:bg-black/40"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Load More Transactions
                      </>
                    )}
                  </Button>
                </div>
              )}
            
              {/* End of transactions message */}
              {!hasMore && transactions.length > 0 && (
                <div className="text-center py-4 text-white/50 text-sm">
                  End of transaction history
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }