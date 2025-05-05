import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TokenLogo } from './token-logo';
import { formatNumber, shortenAddress } from '@/lib/utils';
import { formatTokenValue } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { useTokenDataPrefetch } from '@/hooks/use-token-data-prefetch';
import { Transaction, TransactionTransfer } from '@/lib/api';

type TransactionType = 'all' | 'swap' | 'send' | 'receive' | 'approval' | 'contract';

const getTransactionType = (tx: Transaction): TransactionType => {
  // Check for swap transactions (exchange of tokens)
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
  
  // Check for token approvals
  if (tx.method_label && 
     (tx.method_label.toLowerCase().includes('approve') || 
      tx.method_label.toLowerCase().includes('approval'))) {
    return 'approval';
  }
  
  // Check for token sends
  if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
    // Check if all transfers are outgoing
    const allOutgoing = tx.erc20_transfers.every(t => 
      t.from_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    if (allOutgoing) {
      return 'send';
    }
    
    // Check if all transfers are incoming
    const allIncoming = tx.erc20_transfers.every(t => 
      t.to_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    if (allIncoming) {
      return 'receive';
    }
  }
  
  // Check for native token sends/receives
  if (tx.native_transfers && tx.native_transfers.length > 0) {
    // Check if all transfers are outgoing
    const allOutgoing = tx.native_transfers.every(t => 
      t.from_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    if (allOutgoing) {
      return 'send';
    }
    
    // Check if all transfers are incoming  
    const allIncoming = tx.native_transfers.every(t => 
      t.to_address.toLowerCase() === tx.from_address.toLowerCase()
    );
    
    if (allIncoming) {
      return 'receive';
    }
  }
  
  // Default to contract interaction for other transactions
  return 'contract';
};

interface TransactionHistoryProps {
  walletAddress: string;
  onClose: () => void;
}

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<TransactionType>('all');
  const [copiedAddresses, setCopiedAddresses] = useState<Record<string, boolean>>({});
  const [detailedTx, setDetailedTx] = useState<{[hash: string]: Transaction}>({});
  const { toast } = useToast();
  const { prefetchedLogos, prices } = useTokenDataPrefetch(walletAddress);
  
  // Pagination
  const limit = 25;
  
  // Fetch transactions
  const fetchTransactions = useCallback(async (p: number = 1, append: boolean = false) => {
    try {
      if (p === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const response = await fetch(`/api/wallet/${walletAddress}/transactions?page=${p}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      
      const data = await response.json();
      
      if (data.result && Array.isArray(data.result)) {
        // Calculate and set transaction directions
        data.result.forEach((tx: Transaction) => {
          // Add direction for ERC20 transfers
          if (tx.erc20_transfers) {
            tx.erc20_transfers.forEach(transfer => {
              if (transfer.from_address.toLowerCase() === walletAddress.toLowerCase()) {
                transfer.direction = 'send';
              } else if (transfer.to_address.toLowerCase() === walletAddress.toLowerCase()) {
                transfer.direction = 'receive';
              }
            });
          }
          
          // Add direction for native transfers
          if (tx.native_transfers) {
            tx.native_transfers.forEach(transfer => {
              if (transfer.from_address.toLowerCase() === walletAddress.toLowerCase()) {
                transfer.direction = 'send';
              } else if (transfer.to_address.toLowerCase() === walletAddress.toLowerCase()) {
                transfer.direction = 'receive';
              }
            });
          }
        });
        
        if (append) {
          setTransactions(prev => [...prev, ...data.result]);
        } else {
          setTransactions(data.result);
        }
        
        setHasMore(data.result.length === limit);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load transactions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [walletAddress, toast]);
  
  useEffect(() => {
    if (walletAddress) {
      fetchTransactions();
    }
  }, [walletAddress, fetchTransactions]);
  
  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransactions(nextPage, true);
  };
  
  const toggleExpandTx = (hash: string) => {
    setExpandedTxs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(hash)) {
        newSet.delete(hash);
      } else {
        newSet.add(hash);
        // Load detailed transaction info if needed
        if (!detailedTx[hash]) {
          fetchTransactionDetails(hash);
        }
      }
      return newSet;
    });
  };
  
  const fetchTransactionDetails = async (hash: string) => {
    try {
      const response = await fetch(`/api/transaction/${hash}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch transaction details');
      }
      
      const data = await response.json();
      
      // Add directions for transfers in the detailed response
      if (data.erc20_transfers) {
        data.erc20_transfers.forEach((transfer: TransactionTransfer) => {
          if (transfer.from_address.toLowerCase() === walletAddress.toLowerCase()) {
            transfer.direction = 'send';
          } else if (transfer.to_address.toLowerCase() === walletAddress.toLowerCase()) {
            transfer.direction = 'receive';
          }
        });
      }
      
      if (data.native_transfers) {
        data.native_transfers.forEach((transfer: TransactionTransfer) => {
          if (transfer.from_address.toLowerCase() === walletAddress.toLowerCase()) {
            transfer.direction = 'send';
          } else if (transfer.to_address.toLowerCase() === walletAddress.toLowerCase()) {
            transfer.direction = 'receive';
          }
        });
      }
      
      setDetailedTx(prev => ({
        ...prev,
        [hash]: data
      }));
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load transaction details',
        variant: 'destructive',
      });
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAddresses({ ...copiedAddresses, [text]: true });
      setTimeout(() => {
        setCopiedAddresses(prev => ({ ...prev, [text]: false }));
      }, 2000);
    });
  };
  
  const getTokenAddress = (transfer: TransactionTransfer): string => {
    return transfer.address || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  };
  
  const getTransactionTypeInfo = (txType: TransactionType) => {
    switch (txType) {
      case 'swap':
        return { label: 'Swap', color: 'bg-blue-500/20 text-blue-400' };
      case 'send':
        return { label: 'Send', color: 'bg-red-500/20 text-red-400' };
      case 'receive':
        return { label: 'Receive', color: 'bg-green-500/20 text-green-400' };
      case 'approval':
        return { label: 'Approval', color: 'bg-yellow-500/20 text-yellow-400' };
      case 'contract':
        return { label: 'Contract', color: 'bg-purple-500/20 text-purple-400' };
      default:
        return { label: 'Transaction', color: 'bg-gray-500/20 text-gray-400' };
    }
  };
  
  const filteredTransactions = transactions.filter(tx => {
    if (selectedTab === 'all') return true;
    return getTransactionType(tx) === selectedTab;
  });
  
  const calculateUsdValue = (
    value: string, 
    decimals?: string | undefined, 
    tokenAddress?: string
  ): number | null => {
    if (!value || !decimals || !tokenAddress) return null;
    
    try {
      // First try to find the token in the prefetched token data with prices
      const dec = parseInt(decimals);
      if (isNaN(dec)) return null;
      
      // Calculate the token amount
      const amount = parseFloat(value) / Math.pow(10, dec);
      if (isNaN(amount) || amount === 0) return null;
      
      // This function would ideally be implemented to fetch real token prices
      // from your application state, for example using a useTokenPrices hook
      // For now, we'll use a simplified placeholder that still shows real values
      
      // Get token price from transaction detailed info if available
      const displayTx = detailedTx[transactions.find(tx => 
        tx.erc20_transfers?.some(t => getTokenAddress(t) === tokenAddress) ||
        tx.native_transfers?.some(t => tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
      )?.hash || ''];
      
      let price = null;
      
      // Try to get price from transaction data
      if (displayTx) {
        const transfer = displayTx.erc20_transfers?.find(t => getTokenAddress(t) === tokenAddress);
        price = transfer?.usd_price || null;
        
        // Fallback: If no direct USD price is available, check our prefetched prices
        if (price === null && tokenAddress) {
          const normalizedAddress = tokenAddress.toLowerCase();
          price = prices[normalizedAddress] || null;
        }
      }
      
      // If no price available, we return null
      if (!price) return null;
      
      // Calculate USD value
      return amount * price;
    } catch (error) {
      console.error('Error calculating USD value:', error);
      return null;
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex justify-between items-center p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold">Transaction History</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto">
        {/* Filter tabs */}
        <div className="flex overflow-x-auto p-2 border-b border-white/10 gap-1">
          {(['all', 'swap', 'send', 'receive', 'approval', 'contract'] as TransactionType[]).map(tab => (
            <Button
              key={tab}
              variant={selectedTab === tab ? "secondary" : "ghost"}
              className="whitespace-nowrap text-xs py-1 px-3 h-auto"
              onClick={() => setSelectedTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
        </div>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            <p className="mt-4 text-white/50">Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-400">
            {error}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-4 text-center text-white/50">
            No {selectedTab === 'all' ? '' : selectedTab} transactions found
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredTransactions.map(tx => {
              const isExpanded = expandedTxs.has(tx.hash);
              const displayTx = isExpanded && detailedTx[tx.hash] ? detailedTx[tx.hash] : tx;
              const txType = getTransactionType(tx);
              const typeInfo = getTransactionTypeInfo(txType);
              
              return (
                <div 
                  key={tx.hash} 
                  className="p-4 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => toggleExpandTx(tx.hash)}
                >
                  {/* Transaction summary row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`${typeInfo.color}`}>
                        {typeInfo.label}
                      </Badge>
                      <div className="text-sm">
                        {new Date(tx.block_timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-white/50" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-white/50" />
                      )}
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
                          
                          {/* Check if this is a swap */}
                          {txType === 'swap' && displayTx.erc20_transfers && displayTx.erc20_transfers.length >= 2 ? (
                            <div className="p-2 bg-black/20 rounded-md">
                              {/* For swaps, show simplified in/out view */}
                              <div className="flex items-center justify-between">
                                {(() => {
                                  const sentTokens = displayTx.erc20_transfers.filter(t => 
                                    t.direction === 'send' || 
                                    t.from_address.toLowerCase() === displayTx.from_address.toLowerCase()
                                  );
                                  const receivedTokens = displayTx.erc20_transfers.filter(t => 
                                    t.direction === 'receive' || 
                                    t.to_address.toLowerCase() === displayTx.from_address.toLowerCase()
                                  );
                                  
                                  // Skip if missing inbound or outbound tokens
                                  if (sentTokens.length === 0 || receivedTokens.length === 0) {
                                    return null;
                                  }
                                  
                                  // Get first token sent and last token received for simplicity
                                  const tokenIn = sentTokens[0];
                                  const tokenOut = receivedTokens[receivedTokens.length - 1];
                                  
                                  // Calculate USD values
                                  const tokenInUsd = calculateUsdValue(
                                    tokenIn.value,
                                    tokenIn.token_decimals,
                                    getTokenAddress(tokenIn)
                                  );
                                  
                                  const tokenOutUsd = calculateUsdValue(
                                    tokenOut.value,
                                    tokenOut.token_decimals,
                                    getTokenAddress(tokenOut)
                                  );
                                  
                                  return (
                                    <>
                                      {/* Token In */}
                                      <div className="flex flex-col items-center">
                                        <TokenLogo 
                                          address={getTokenAddress(tokenIn)}
                                          symbol={tokenIn.token_symbol || ''}
                                          fallbackLogo={prefetchedLogos[getTokenAddress(tokenIn)]}
                                          size="md"
                                        />
                                        <div className="mt-1.5 text-center">
                                          <div className="text-red-400 font-medium">
                                            {tokenIn.value_formatted || formatTokenValue(tokenIn.value, tokenIn.token_decimals)} {tokenIn.token_symbol}
                                          </div>
                                          {tokenInUsd !== null && (
                                            <div className="text-xs text-white/60">${tokenInUsd.toFixed(2)}</div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* Swap Arrow */}
                                      <div>
                                        <ArrowRight className="h-6 w-6 text-white/40" />
                                      </div>
                                      
                                      {/* Token Out */}
                                      <div className="flex flex-col items-center">
                                        <TokenLogo 
                                          address={getTokenAddress(tokenOut)}
                                          symbol={tokenOut.token_symbol || ''}
                                          fallbackLogo={prefetchedLogos[getTokenAddress(tokenOut)]}
                                          size="md"
                                        />
                                        <div className="mt-1.5 text-center">
                                          <div className="text-green-400 font-medium">
                                            {tokenOut.value_formatted || formatTokenValue(tokenOut.value, tokenOut.token_decimals)} {tokenOut.token_symbol}
                                          </div>
                                          {tokenOutUsd !== null && (
                                            <div className="text-xs text-white/60">${tokenOutUsd.toFixed(2)}</div>
                                          )}
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              
                              {/* Show message about routing if there are more than 2 transfers */}
                              {displayTx.erc20_transfers.length > 2 && (
                                <div className="text-xs text-white/60 text-center mt-2">
                                  Via {displayTx.erc20_transfers.length - 2} intermediate steps
                                </div>
                              )}
                            </div>
                          ) : (
                            // For non-swaps, show regular token transfers
                            <>
                              {/* ERC20 Transfers */}
                              {displayTx.erc20_transfers && displayTx.erc20_transfers.length > 0 && (
                                <div className="space-y-2">
                                  {displayTx.erc20_transfers.map((transfer, i) => {
                                    // Calculate USD value for the token transfer
                                    const usdValue = calculateUsdValue(
                                      transfer.value,
                                      transfer.token_decimals,
                                      getTokenAddress(transfer)
                                    );
                                    
                                    return (
                                      <div key={`erc20-${displayTx.hash}-${i}`} className="flex items-center p-2 bg-black/20 rounded-md">
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
                                            {transfer.direction === 'send' ? '-' : '+'}{transfer.value_formatted || formatTokenValue(transfer.value, transfer.token_decimals)} {transfer.token_symbol}
                                          </div>
                                          {usdValue !== null && (
                                            <div className="text-xs text-white/60">
                                              ${usdValue.toFixed(2)}
                                            </div>
                                          )}
                                          <div className="text-xs text-white/60 mt-1">
                                            {transfer.direction === 'send' ? 'Sent' : 'Received'}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                          
                              {/* Native Transfers */}
                              {displayTx.native_transfers && displayTx.native_transfers.length > 0 && (
                                <div className="space-y-2 mt-2">
                                  {displayTx.native_transfers.map((transfer, i) => {
                                    // Calculate USD value for PLS
                                    const usdValue = calculateUsdValue(
                                      transfer.value,
                                      '18', // PLS has 18 decimals
                                      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' // PLS address
                                    );
                                    
                                    return (
                                      <div key={`native-${displayTx.hash}-${i}`} className="flex items-center p-2 bg-black/20 rounded-md">
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
                                            {transfer.direction === 'send' ? '-' : '+'}{transfer.value_formatted || formatTokenValue(transfer.value, '18')} PLS
                                          </div>
                                          {usdValue !== null && (
                                            <div className="text-xs text-white/60">
                                              ${usdValue.toFixed(2)}
                                            </div>
                                          )}
                                          <div className="text-xs text-white/60 mt-1">
                                            {transfer.direction === 'send' ? 'Sent' : 'Received'}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
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
        )}
        
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