import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { formatDate, shortenAddress } from '@/lib/utils';

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

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [visibleTokenAddresses, setVisibleTokenAddresses] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Add state for token prices
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});

  // Initial transaction data fetch
  const { isLoading, isError, data: initialData, refetch } = useQuery({
    queryKey: ['transactions', walletAddress, Date.now()], // Add timestamp to force refetch on remount
    queryFn: async () => {
      console.log('Fetching transaction history for:', walletAddress);
      try {
        // Use the actual wallet address (not the token address)
        const response = await fetchTransactionHistory(walletAddress, TRANSACTIONS_PER_BATCH);
        console.log('Initial transaction history fetched:', response ? 'yes' : 'no', 
          response?.result ? `${response.result.length} transactions` : '', 
          'Response data:', JSON.stringify(response).substring(0, 300) + '...');
        
        // Check if there's an error
        if (response?.error) {
          console.error('Error in transaction history response:', response.error);
          throw new Error(response.error);
        }
        
        // Update state with the response data
        if (response?.result) {
          console.log(`Setting ${response.result.length} transactions`);
          setTransactions(response.result || []);
          setNextCursor(response.cursor);
          setHasMore(!!response.cursor); // Has more if cursor exists
        } else {
          console.log('No transactions found in response, clearing state');
          setTransactions([]);
          setHasMore(false);
        }
        
        return response;
      } catch (error) {
        console.error('Error fetching transaction history:', error);
        throw error;
      }
    },
    enabled: !!walletAddress,
    staleTime: 0, // Don't use stale data
    gcTime: 0, // Don't keep data in cache
    refetchOnMount: true, // Always refetch when component mounts
    retry: 2, // Retry failed requests up to 2 times
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 10000), // Exponential backoff
  });
  
  // Function to load more transactions
  const loadMoreTransactions = useCallback(async () => {
    if (!nextCursor || isLoadingMore || !walletAddress) return;
    
    setIsLoadingMore(true);
    try {
      const moreData = await fetchTransactionHistory(
        walletAddress, 
        TRANSACTIONS_PER_BATCH, 
        nextCursor
      );
      
      if (moreData?.result) {
        // Append new transactions to existing list
        setTransactions(prev => [...prev, ...moreData.result]);
        setNextCursor(moreData.cursor);
        setHasMore(!!moreData.cursor); // Has more if cursor exists
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more transactions:', error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, walletAddress]);

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return formatDate(new Date(timestamp));
  };

  // Format value based on token decimals
  const formatTokenValue = (value: string, decimals: string = '18') => {
    const decimalValue = parseInt(decimals);
    return (parseInt(value) / 10 ** decimalValue).toFixed(decimalValue > 8 ? 4 : 2);
  };

  // Fetch wallet data to get token prices
  const { data: walletData } = useQuery({
    queryKey: ['wallet', walletAddress, Date.now()], // Add timestamp to force refetch
    queryFn: async () => {
      try {
        return await fetchWalletData(walletAddress);
      } catch (error) {
        console.error('Error fetching wallet data:', error);
        return null;
      }
    },
    enabled: !!walletAddress,
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true, // Always refetch when component mounts
  });

  // Update token prices whenever wallet data changes
  useEffect(() => {
    if (walletData?.tokens) {
      // Create a map of token addresses to their prices
      const priceMap: Record<string, number> = {};
      
      walletData.tokens.forEach(token => {
        // Normalize addresses to lowercase for consistent comparison
        const tokenAddress = token.address.toLowerCase();
        
        // Only include tokens that have a price
        if (token.price) {
          priceMap[tokenAddress] = token.price;
        }
      });
      
      // Add PLS token price (using native token address)
      const plsToken = walletData.tokens.find(t => 
        t.isNative === true || t.symbol === 'PLS' || 
        t.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      );
      
      if (plsToken?.price) {
        priceMap['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsToken.price;
      }
      
      console.log('Updated token prices for transaction history:', priceMap);
      setTokenPrices(priceMap);
    }
  }, [walletData]);

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
    console.log('Calculate USD Value:', { 
      valueRaw: value,
      decimals, 
      tokenAddress: addressToUse,
      price, 
      tokenPrices
    });
    
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
    console.log('Calculated USD value:', { tokenAmount, price, usdValue });
    
    return usdValue;
  };

  // Extract token addresses for logos
  useEffect(() => {
    if (transactions) {
      const addresses = new Set<string>();
      
      transactions.forEach((tx: Transaction) => {
        // Get token addresses from ERC20 transfers
        if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
          tx.erc20_transfers.forEach(transfer => {
            if (transfer.address) {
              addresses.add(transfer.address);
            }
          });
        }
        
        // Add native token address for native transfers
        if (tx.native_transfers && tx.native_transfers.length > 0) {
          addresses.add('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        }
      });
      
      setVisibleTokenAddresses(Array.from(addresses));
    }
  }, [transactions]);

  if (isLoading) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 size={40} className="animate-spin text-primary mb-4" />
          <h3 className="text-xl font-bold">Loading Transaction History...</h3>
          <p className="text-muted-foreground mt-2">
            This may take a moment depending on your transaction count
          </p>
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
        <div className="text-error text-6xl mb-4">
          <div className="flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Unable to load transaction history
        </h3>
        <p className="text-muted-foreground mb-4">
          The PulseChain API is experiencing high volume. Please try again in a few moments.
        </p>
        <div className="flex justify-center gap-3 my-4">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
          >
            <RefreshCw size={16} className="mr-1" />
            <span className="text-sm font-medium">Try Again</span>
          </button>
          
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
          >
            <Wallet size={16} className="mr-1" />
            <span className="text-sm font-medium">View Tokens</span>
          </button>
        </div>
      </Card>
    );
  }

  // Empty state
  if (!transactions || transactions.length === 0) {
    return (
      <Card className="p-6 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          No transactions found
        </h3>
        <p className="text-muted-foreground mb-4">
          No transaction history was found for this wallet.
        </p>
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200 mx-auto"
        >
          <Wallet size={16} className="mr-1" />
          <span className="text-sm font-medium">View Tokens</span>
        </button>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg glass-card">
      <div className="p-6 border-b border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center">
            <h2 className="text-xl font-bold text-white mr-2">
              Transaction History
            </h2>
            <span className="text-sm bg-secondary/40 text-white px-2 py-1 rounded-md">
              {transactions.length} Transactions
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md glass-card border border-white/10 text-white/80 hover:bg-black/40 hover:border-white/30 transition-all duration-200"
          >
            <Wallet size={16} className="mr-1" />
            <span className="text-sm font-medium">View Tokens</span>
          </button>
        </div>
      </div>
      
      {/* Mobile View */}
      <div className="block md:hidden">
        <div className="p-4 space-y-4">
          {transactions.map((tx: Transaction) => (
            <div key={tx.hash} className="p-4 glass-card rounded-lg hover:bg-black/20 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {formatTimestamp(tx.block_timestamp)}
                </span>
                <a 
                  href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
              
              {/* Transaction Summary */}
              <div className="mb-3">
                <div className="text-sm font-medium">
                  {tx.summary || tx.method_label || 'Transaction'}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {tx.category || 'Unknown type'}
                  </div>
                  {tx.method_label && (
                    <div className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary-foreground">
                      {tx.method_label}
                    </div>
                  )}
                </div>
              </div>
              
              {/* ERC20 Transfers */}
              {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                <div key={`${tx.hash}-erc20-${i}`} className="flex items-center justify-between mb-2 p-2 bg-secondary/20 rounded-md">
                  <div className="flex items-center">
                    <TokenLogo 
                      address={transfer.address || ''}
                      symbol={transfer.token_symbol || ''}
                      size="sm"
                    />
                    <div className="ml-2">
                      <div className="flex items-center">
                        <div className="mr-1">
                          {transfer.direction === 'receive' ? (
                            <ArrowDownLeft size={14} className="text-green-400" />
                          ) : (
                            <ArrowUpRight size={14} className="text-red-400" />
                          )}
                        </div>
                        <span className="text-sm font-medium">
                          {transfer.token_symbol}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                        {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)}
                    </div>
                    {/* Display USD value if available */}
                    {calculateUsdValue(transfer.value, transfer.token_decimals, transfer.address || '') && (
                      <div className="text-xs text-muted-foreground flex items-center justify-end">
                        <DollarSign size={10} className="mr-0.5" />
                        {(calculateUsdValue(transfer.value, transfer.token_decimals, transfer.address || '') || 0).toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Native Transfers */}
              {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                <div key={`${tx.hash}-native-${i}`} className="flex items-center justify-between mb-2 p-2 bg-secondary/20 rounded-md">
                  <div className="flex items-center">
                    <TokenLogo 
                      address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                      symbol="PLS"
                      size="sm"
                    />
                    <div className="ml-2">
                      <div className="flex items-center">
                        <div className="mr-1">
                          {transfer.direction === 'receive' ? (
                            <ArrowDownLeft size={14} className="text-green-400" />
                          ) : (
                            <ArrowUpRight size={14} className="text-red-400" />
                          )}
                        </div>
                        <span className="text-sm font-medium">
                          {transfer.token_symbol || 'PLS'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                        {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value)}
                    </div>
                    {/* Display USD value if available for native PLS token */}
                    {calculateUsdValue(transfer.value, '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') && (
                      <div className="text-xs text-muted-foreground flex items-center justify-end">
                        <DollarSign size={10} className="mr-0.5" />
                        {(calculateUsdValue(transfer.value, '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || 0).toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Gas Fee */}
              <div className="mt-2 text-xs text-right text-muted-foreground">
                Gas Fee: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
                {/* Add USD value for gas fee if available */}
                {calculateUsdValue(tx.transaction_fee.toString(), '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') && (
                  <div className="flex items-center justify-end mt-0.5">
                    <DollarSign size={10} className="mr-0.5" />
                    {(calculateUsdValue(tx.transaction_fee.toString(), '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || 0).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Desktop View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-black/20 backdrop-blur-md">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6 first:rounded-tl-md">
                Time
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                Type
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-2/6">
                Details
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/6">
                Value
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/12 last:rounded-tr-md">
                Block
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {transactions.map((tx: Transaction) => (
              <tr key={tx.hash} className="hover:bg-black/20 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-foreground">
                    {formatTimestamp(tx.block_timestamp)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-foreground">
                    {tx.category || 'Transaction'}
                  </div>
                  {tx.method_label && (
                    <div className="mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary-foreground">
                        {tx.method_label}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">
                    {tx.summary || 'Transaction details'}
                    
                    {/* ERC20 Transfers */}
                    {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                      <div key={`${tx.hash}-erc20-${i}`} className="flex items-center mt-2">
                        <TokenLogo 
                          address={transfer.address || ''}
                          symbol={transfer.token_symbol || ''}
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
                          <span className="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
                            {transfer.token_symbol}
                            <span className="text-xs text-muted-foreground ml-2">
                              {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                              {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                            </span>
                          </span>
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
                          <span className="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
                            {transfer.token_symbol || 'PLS'}
                            <span className="text-xs text-muted-foreground ml-2">
                              {transfer.direction === 'receive' ? 'From: ' : 'To: '}
                              {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-erc20-value-${i}`} className={`${i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                        {transfer.direction === 'receive' ? '+' : '-'}
                        {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                      </div>
                      {/* Add USD value display */}
                      {calculateUsdValue(transfer.value, transfer.token_decimals, transfer.address || '') && (
                        <div className="text-xs text-muted-foreground flex items-center justify-end">
                          <DollarSign size={10} className="mr-0.5" />
                          {(calculateUsdValue(transfer.value, transfer.token_decimals, transfer.address || '') || 0).toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-native-value-${i}`} className={`${(tx.erc20_transfers?.length || 0) > 0 || i > 0 ? 'mt-2' : ''}`}>
                      <div className={`text-sm ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                        {transfer.direction === 'receive' ? '+' : '-'}
                        {transfer.value_formatted || formatTokenValue(transfer.value)} {transfer.token_symbol || 'PLS'}
                      </div>
                      {/* Add USD value display for native PLS token */}
                      {calculateUsdValue(transfer.value, '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') && (
                        <div className="text-xs text-muted-foreground flex items-center justify-end">
                          <DollarSign size={10} className="mr-0.5" />
                          {(calculateUsdValue(transfer.value, '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || 0).toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <div className="text-xs text-muted-foreground mt-2">
                    Gas: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
                    {/* Add USD value for gas fee if available */}
                    {calculateUsdValue(tx.transaction_fee.toString(), '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') && (
                      <div className="flex items-center justify-end mt-0.5">
                        <DollarSign size={10} className="mr-0.5" />
                        {(calculateUsdValue(tx.transaction_fee.toString(), '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || 0).toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2
                        })}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <a 
                    href={`https://scan.pulsechain.com/tx/${tx.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
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
      
      {/* Load More Button (if there are more transactions) */}
      {hasMore && (
        <div className="p-6 flex justify-center">
          <Button 
            variant="secondary" 
            onClick={loadMoreTransactions}
            disabled={isLoadingMore}
            className="w-full max-w-md"
          >
            {isLoadingMore ? (
              <span className="flex items-center">
                <Loader2 size={18} className="mr-2 animate-spin" /> 
                Loading more transactions...
              </span>
            ) : (
              <span className="flex items-center">
                <ChevronDown size={18} className="mr-2" /> 
                Load More Transactions
              </span>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}