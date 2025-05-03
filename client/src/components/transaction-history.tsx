import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, TransactionResponse } from '@/lib/api';
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

// Number of transactions to load per batch
const TRANSACTIONS_PER_BATCH = 200;

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [visibleTokenAddresses, setVisibleTokenAddresses] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Initial transaction data fetch
  const { isLoading, isError, data: initialData } = useQuery({
    queryKey: ['transactions', walletAddress],
    queryFn: async () => {
      console.log('Fetching transaction history for:', walletAddress);
      try {
        // Use the actual wallet address (not the token address)
        const response = await fetchTransactionHistory(walletAddress, TRANSACTIONS_PER_BATCH);
        console.log('Initial transaction history fetched:', response ? 'yes' : 'no', 
          response?.result ? `${response.result.length} transactions` : '');
        
        // Update state with the response data
        if (response?.result) {
          setTransactions(response.result || []);
          setNextCursor(response.cursor);
          setHasMore(!!response.cursor); // Has more if cursor exists
        } else {
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
    staleTime: 60 * 1000, // 1 minute
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
          There was an error retrieving the transaction history. Please try again later.
        </p>
        <Button onClick={onClose} variant="outline">
          Back to Tokens
        </Button>
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
        <Button onClick={onClose} variant="outline">
          Back to Tokens
        </Button>
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
          <Button onClick={onClose} variant="outline" size="sm">
            View Tokens
          </Button>
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
                <div className="text-xs text-muted-foreground">
                  {tx.category || 'Unknown type'}
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
                  </div>
                </div>
              ))}
              
              {/* Gas Fee */}
              <div className="mt-2 text-xs text-right text-muted-foreground">
                Gas Fee: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
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
                    {tx.category || (tx.method_label ? `Method: ${tx.method_label}` : 'Transaction')}
                  </div>
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
                    <div key={`${tx.hash}-erc20-value-${i}`} className={`text-sm ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'} ${i > 0 ? 'mt-2' : ''}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                    </div>
                  ))}
                  
                  {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                    <div key={`${tx.hash}-native-value-${i}`} className={`text-sm ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'} ${(tx.erc20_transfers?.length || 0) > 0 || i > 0 ? 'mt-2' : ''}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {transfer.value_formatted || formatTokenValue(transfer.value)} {transfer.token_symbol || 'PLS'}
                    </div>
                  ))}
                  
                  <div className="text-xs text-muted-foreground mt-2">
                    Gas: {parseFloat(tx.transaction_fee).toFixed(6)} PLS
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
    </Card>
  );
}