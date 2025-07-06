import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ArrowRight, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw, Filter, Plus, Copy, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { shortenAddress } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { Link } from 'wouter';
import { useTokenDataPrefetch } from '@/hooks/use-token-data-prefetch';
import { useBatchTokenPrices } from '@/hooks/use-batch-token-prices';
import { fetchTransactionDetails, extractTokensFromTxDetails } from '@/services/transaction-service';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Transaction interfaces
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

type TransactionType = 'all' | 'swap' | 'send' | 'receive' | 'approval' | 'contract';

const getTransactionType = (tx: Transaction, walletAddress: string): TransactionType => {
  // Check for swaps - simplified to just check for DEX routers or swap methods
  const swapMethodSignatures = ['swap', 'trade', 'multicall', 'exactinput', 'exactoutput', 'swapexact', 'swaptokens'];
  const isSwapMethod = tx.method_label && swapMethodSignatures.some(sig => tx.method_label?.toLowerCase().includes(sig));
  
  const dexRouterAddresses = [
    '0xda9aba4eacf54e0273f56dfffee6b8f1e20b23bba', // PulseX Router
    '0x165c3410fc91ef562c50559f7d2289febb913d90', // PulseX Router V2
    '0x98bf93ebf5c380c0e6ae8e192a7e2ae08edacc02', // PulseX Factory
  ];
  const isDexRouter = dexRouterAddresses.includes(tx.to_address?.toLowerCase() || '');
  
  if (isSwapMethod || isDexRouter) {
    return 'swap';
  }
  
  const hasSendTransfers = tx.erc20_transfers?.some(t => t && t.direction === 'send');
  const hasReceiveTransfers = tx.erc20_transfers?.some(t => t && t.direction === 'receive');
  
  // Check for approvals
  if (tx.method_label?.toLowerCase().includes('approve')) {
    return 'approval';
  }
  
  // Check for sends/receives
  if (hasSendTransfers) return 'send';
  if (hasReceiveTransfers) return 'receive';
  
  // Check for contract interactions
  if (tx.to_address && tx.value === '0' && !tx.erc20_transfers?.length) {
    return 'contract';
  }
  
  return 'all';
};



// Format date helper
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

// Format token value helper
const formatTokenValue = (value: string, decimals?: string, maxLength: number = 20): string => {
  if (!value || value === '0') return '0';
  
  const decimalCount = parseInt(decimals || '18');
  const divisor = Math.pow(10, decimalCount);
  const numValue = parseFloat(value) / divisor;
  
  if (numValue >= 1e12) return `${(numValue / 1e12).toFixed(2)}T`;
  if (numValue >= 1e9) return `${(numValue / 1e9).toFixed(2)}B`;
  if (numValue >= 1e6) return `${(numValue / 1e6).toFixed(2)}M`;
  if (numValue >= 1e3) return `${(numValue / 1e3).toFixed(2)}K`;
  
  if (numValue < 0.01) return '<0.01';
  return numValue.toFixed(2);
};

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [tokenFilter, setTokenFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType>('all');
  const [copiedAddresses, setCopiedAddresses] = useState<Record<string, boolean>>({});
  
  // Fetch initial transactions using blockchain endpoint
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/wallet/${walletAddress}/blockchain-transactions`, { limit: 50 }],
    queryFn: async () => {
      const url = `/api/wallet/${walletAddress}/blockchain-transactions?limit=50`;
      console.log(`Fetching blockchain transactions: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch blockchain transactions');
      }
      
      return response.json();
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  
  // Prefetch token data for all transfers
  const tokenAddresses = useMemo(() => {
    const addresses = new Set<string>();
    transactions.forEach(tx => {
      tx.erc20_transfers?.forEach(transfer => {
        if (transfer.address) {
          addresses.add(transfer.address.toLowerCase());
        }
      });
      // Add WPLS for native PLS transactions
      if (tx.value !== '0' || tx.native_transfers?.length) {
        addresses.add('0xa1077a294dde1b09bb078844df40758a5d0f9a27'); // WPLS
      }
    });
    return Array.from(addresses);
  }, [transactions]);
  
  const { logos: prefetchedLogos } = useTokenDataPrefetch(walletAddress, tokenAddresses);
  const batchPricesResult = useBatchTokenPrices(tokenAddresses);
  const batchPrices = batchPricesResult.data;
  
  // Copy to clipboard helper
  const copyToClipboard = async (text: string, key?: string) => {
    await navigator.clipboard.writeText(text);
    const addressKey = key || text;
    setCopiedAddresses({ ...copiedAddresses, [addressKey]: true });
    setTimeout(() => {
      setCopiedAddresses(prev => ({ ...prev, [addressKey]: false }));
    }, 2000);
  };
  
  // Calculate USD value
  const calculateUsdValue = (value: string, decimals?: string, tokenAddress?: string): number | null => {
    if (!tokenAddress || !batchPrices) return null;
    
    // For native PLS, use WPLS price
    const lookupAddress = tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
      ? '0xa1077a294dde1b09bb078844df40758a5d0f9a27' // Use WPLS price for native PLS
      : tokenAddress.toLowerCase();
    
    if (!batchPrices[lookupAddress]) return null;
    
    const price = batchPrices[lookupAddress];
    const decimalCount = parseInt(decimals || '18');
    const numValue = parseFloat(value) / Math.pow(10, decimalCount);
    
    return numValue * price;
  };
  
  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesType = typeFilter === 'all' || getTransactionType(tx, walletAddress) === typeFilter;
      const matchesToken = !tokenFilter || 
        tx.erc20_transfers?.some(t => 
          t.token_symbol?.toLowerCase().includes(tokenFilter.toLowerCase()) ||
          t.token_name?.toLowerCase().includes(tokenFilter.toLowerCase())
        );
      
      return matchesType && matchesToken;
    });
  }, [transactions, typeFilter, tokenFilter]);
  
  // Update transactions when data loads
  useEffect(() => {
    if (data) {
      // Handle both result array and transactions array
      const txData = data.result || data.transactions || [];
      setTransactions(Array.isArray(txData) ? txData : []);
      setCursor(data.cursor || data.lastBlock || null);
      setHasMore(!!(data.cursor || data.hasMore));
    }
  }, [data]);
  

  
  if (isLoading) {
    return (
      <Card className="border-border shadow-lg backdrop-blur-sm glass-card p-8">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading transaction history...</p>
        </div>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card className="border-border shadow-lg backdrop-blur-sm glass-card p-8">
        <div className="text-center">
          <p className="text-red-500 mb-4">Failed to load transaction history</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </Card>
    );
  }
  
  return (
    <Card className="border-border shadow-lg backdrop-blur-sm glass-card">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              Transaction History
              <span className="text-white text-sm ml-2 opacity-60">
                {transactions.length} transactions
              </span>
            </h2>
            <div className="text-xs text-gray-400 mt-1">
              Detailed transaction history with comprehensive token metadata
              {hasMore && <span className="ml-2">• More available</span>}
            </div>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Token Search Filter */}
            <input
              type="text"
              placeholder="Search by token"
              value={tokenFilter}
              onChange={(e) => setTokenFilter(e.target.value)}
              className="w-48 px-3 py-1.5 text-sm bg-black/40 border border-white/10 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-white/30"
            />
            
            {/* Type Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter size={14} />
                  {typeFilter === 'all' ? 'All Types' : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setTypeFilter('all')}>All Types</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter('swap')}>Swaps</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter('send')}>Sends</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter('receive')}>Receives</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter('approval')}>Approvals</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTypeFilter('contract')}>Contract</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button onClick={onClose} variant="ghost" size="sm">
              Close
            </Button>
          </div>
        </div>
      </div>
      
      {/* Transactions List */}
      <div className="divide-y divide-border max-h-[80vh] overflow-y-auto">
        {filteredTransactions.map((tx, index) => (
          <div key={`${tx.hash}-${index}`} className="p-3 hover:bg-white/5 transition-colors">
            {/* Transaction Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <a 
                  href={`https://otter.pulsechain.com/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                >
                  {shortenAddress(tx.hash)}
                  <ExternalLink size={10} />
                </a>
                <span className="text-xs text-muted-foreground">
                  {formatDate(new Date(tx.block_timestamp).getTime())}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                Block #{parseInt(tx.block_number).toLocaleString()}
              </div>
            </div>
            
            {/* Transaction Content */}
            <div className="space-y-2">
              {(() => {
                // Calculate net token flows for ALL transactions
                const tokenFlows = new Map<string, {
                  symbol: string;
                  name?: string;
                  logo?: string;
                  decimals: string;
                  netAmount: bigint;
                  address: string;
                }>();
                
                // Add native PLS if transaction has value (sent)
                if (tx.value && tx.value !== '0' && tx.from_address.toLowerCase() === walletAddress.toLowerCase()) {
                  const plsAmount = BigInt(tx.value);
                  tokenFlows.set('native', {
                    symbol: 'PLS',
                    name: 'PulseChain',
                    logo: '/assets/pls logo trimmed.png',
                    decimals: '18',
                    netAmount: -plsAmount, // Negative because sent
                    address: 'native'
                  });
                }
                
                // Check if this is a swap transaction
                const isSwapTx = tx.to_address && (
                  tx.to_address.toLowerCase() === '0xda9aba4eacf54e0273f56dfffee6b8f1e20b23bba' || // PulseX Router
                  tx.to_address.toLowerCase() === '0x165c3410fc91ef562c50559f7d2289febb913d90' || // PulseX Router V2
                  (tx.method_label && tx.method_label.toLowerCase().includes('swap'))
                );
                
                // Process all transfers to calculate net amounts
                [...(tx.erc20_transfers || []), ...(tx.native_transfers || [])].forEach(transfer => {
                  const tokenKey = transfer.address || 'native';
                  const isWPLS = transfer.address?.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
                  
                  // Skip WPLS transfers in swap transactions when native PLS was sent
                  // This prevents double-counting PLS->WPLS->Token swaps
                  if (isSwapTx && isWPLS && tx.value && tx.value !== '0' && tx.from_address.toLowerCase() === walletAddress.toLowerCase()) {
                    console.log('Skipping WPLS transfer in swap to prevent double-counting');
                    return;
                  }
                  
                  // Skip WPLS withdrawals that are already counted as native PLS sends
                  // This prevents double-counting in swap transactions
                  if (transfer.internal_transaction && 
                      transfer.address === 'native' && 
                      transfer.from_address?.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27' &&
                      tx.value && tx.value !== '0') {
                    console.log('Skipping WPLS withdrawal to prevent double-counting');
                    return;
                  }
                  
                  // Parse the value properly
                  let amount: bigint;
                  try {
                    if (transfer.value?.startsWith('0x')) {
                      amount = BigInt(transfer.value);
                    } else {
                      amount = BigInt(transfer.value || '0');
                    }
                  } catch {
                    amount = BigInt(0);
                  }
                  
                  const isReceive = transfer.direction === 'receive';
                  
                  if (!tokenFlows.has(tokenKey)) {
                    tokenFlows.set(tokenKey, {
                      symbol: transfer.token_symbol || (tokenKey === 'native' ? 'PLS' : 'UNKNOWN'),
                      name: transfer.token_name,
                      logo: transfer.token_logo || prefetchedLogos[transfer.address?.toLowerCase() || ''] || (tokenKey === 'native' ? '/assets/pls logo trimmed.png' : undefined),
                      decimals: transfer.token_decimals || '18',
                      netAmount: BigInt(0),
                      address: transfer.address || 'native'
                    });
                  }
                  
                  const token = tokenFlows.get(tokenKey)!;
                  token.netAmount += isReceive ? amount : -amount;
                });
                
                // Convert to arrays and filter out zero net amounts
                const sentTokens: Array<{
                  symbol: string;
                  name?: string;
                  logo?: string;
                  decimals: string;
                  netAmount: bigint;
                  address: string;
                }> = [];
                const receivedTokens: Array<{
                  symbol: string;
                  name?: string;
                  logo?: string;
                  decimals: string;
                  netAmount: bigint;
                  address: string;
                }> = [];
                
                tokenFlows.forEach((token) => {
                  if (token.netAmount < BigInt(0)) {
                    sentTokens.push({ ...token, netAmount: -token.netAmount });
                  } else if (token.netAmount > BigInt(0)) {
                    receivedTokens.push(token);
                  }
                  // Ignore tokens with net zero flow
                });
                
                // If no net flows, check for simple transfers
                if (sentTokens.length === 0 && receivedTokens.length === 0) {
                  // Check if it's just a simple PLS transfer
                  if (tx.value && tx.value !== '0') {
                    return (
                      <div className="flex items-center gap-2">
                        <TokenLogo 
                          address=""
                          symbol="PLS"
                          logo="/assets/pls logo trimmed.png"
                          size="sm"
                        />
                        <span className="font-medium text-white">
                          {formatTokenValue(tx.value, '18')}
                        </span>
                        <span className="text-gray-400">PLS</span>
                        {(() => {
                          const usdValue = calculateUsdValue(tx.value, '18', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
                          if (usdValue !== null && usdValue >= 0.01) {
                            return <span className="text-xs text-gray-500">({formatCurrency(usdValue)})</span>;
                          }
                          return null;
                        })()}
                        <span className="text-gray-400">sent to</span>
                        <a
                          href={`https://otter.pulsechain.com/address/${tx.to_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-300 font-mono text-xs"
                        >
                          {tx.to_address.slice(0, 6)}...{tx.to_address.slice(-4)}
                        </a>
                      </div>
                    );
                  }
                  return null;
                }
                
                // Show the primary flow (largest sent and received)
                const primarySent = sentTokens.sort((a, b) => {
                  // Sort by value size (roughly)
                  const aVal = Number(a.netAmount / BigInt(10 ** Math.max(0, parseInt(a.decimals) - 6)));
                  const bVal = Number(b.netAmount / BigInt(10 ** Math.max(0, parseInt(b.decimals) - 6)));
                  return bVal - aVal;
                })[0];
                
                const primaryReceived = receivedTokens.sort((a, b) => {
                  const aVal = Number(a.netAmount / BigInt(10 ** Math.max(0, parseInt(a.decimals) - 6)));
                  const bVal = Number(b.netAmount / BigInt(10 ** Math.max(0, parseInt(b.decimals) - 6)));
                  return bVal - aVal;
                })[0];
                
                return (
                  <div className="flex items-center gap-2">
                    {primarySent && primaryReceived && (
                      <RefreshCw className="text-purple-400" size={14} />
                    )}
                    {primarySent && (
                      <>
                        <TokenLogo 
                          address={primarySent.address === 'native' ? '' : primarySent.address}
                          symbol={primarySent.symbol}
                          logo={primarySent.logo}
                          size="sm"
                        />
                        <span className="font-medium text-white">
                          {formatTokenValue(primarySent.netAmount.toString(), primarySent.decimals)}
                        </span>
                        <span className="text-gray-400">{primarySent.symbol}</span>
                        {(() => {
                          const tokenAddr = primarySent.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primarySent.address;
                          const usdValue = calculateUsdValue(primarySent.netAmount.toString(), primarySent.decimals, tokenAddr);
                          if (usdValue !== null && usdValue >= 0.01) {
                            return <span className="text-xs text-gray-500">({formatCurrency(usdValue)})</span>;
                          }
                          return null;
                        })()}
                      </>
                    )}
                    
                    {primarySent && primaryReceived && (
                      <ArrowRight size={14} className="text-gray-400" />
                    )}
                    
                    {primaryReceived && (
                      <>
                        <TokenLogo 
                          address={primaryReceived.address === 'native' ? '' : primaryReceived.address}
                          symbol={primaryReceived.symbol}
                          logo={primaryReceived.logo}
                          size="sm"
                        />
                        <span className="font-medium text-white">
                          {formatTokenValue(primaryReceived.netAmount.toString(), primaryReceived.decimals)}
                        </span>
                        <span className="text-gray-400">{primaryReceived.symbol}</span>
                        {(() => {
                          const tokenAddr = primaryReceived.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primaryReceived.address;
                          const usdValue = calculateUsdValue(primaryReceived.netAmount.toString(), primaryReceived.decimals, tokenAddr);
                          if (usdValue !== null && usdValue >= 0.01) {
                            return <span className="text-xs text-gray-500">({formatCurrency(usdValue)})</span>;
                          }
                          return null;
                        })()}
                      </>
                    )}
                    
                    {!primaryReceived && primarySent && (
                      <>
                        <span className="text-gray-400">sent to</span>
                        <a
                          href={`https://otter.pulsechain.com/address/${tx.to_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-300 font-mono text-xs"
                        >
                          {tx.to_address.slice(0, 6)}...{tx.to_address.slice(-4)}
                        </a>
                      </>
                    )}
                    {!primarySent && primaryReceived && (
                      <span className="text-gray-400">received</span>
                    )}
                  </div>
                );

              })()}
              
              {/* Transaction Details - Only show if failed */}
              {tx.receipt_status === '0' && (
                <div className="text-xs text-red-400 mt-1">
                  Transaction Failed
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Load More */}
      {hasMore && (
        <div className="p-4 border-t border-border">
          <Button 
            className="w-full" 
            variant="outline"
            disabled={isLoadingMore}
            onClick={async () => {
              if (!cursor || isLoadingMore) return;
              
              setIsLoadingMore(true);
              try {
                const url = `/api/wallet/${walletAddress}/blockchain-transactions?limit=50${cursor ? `&startBlock=${cursor}` : ''}`;
                console.log(`Loading more blockchain transactions: ${url}`);
                const response = await fetch(url);
                
                if (!response.ok) {
                  throw new Error('Failed to load more transactions');
                }
                
                const data = await response.json();
                if (data.result) {
                  setTransactions([...transactions, ...data.result]);
                  setCursor(data.cursor || null);
                  setHasMore(!!data.cursor);
                }
              } catch (error) {
                console.error('Failed to load more transactions:', error);
              } finally {
                setIsLoadingMore(false);
              }
            }}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load More Transactions'
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}