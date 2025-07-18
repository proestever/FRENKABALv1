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
  // Check for swaps - enhanced detection
  const swapMethodSignatures = [
    'swap', 'trade', 'multicall', 'exactinput', 'exactoutput', 'swapexact', 'swaptokens',
    'swapETHForExactTokens', 'swapExactETHForTokens', 'swapTokensForExactETH', 'swapExactTokensForETH',
    'swapTokensForExactTokens', 'swapExactTokensForTokens', 'addLiquidity', 'removeLiquidity'
  ];
  const isSwapMethod = tx.method_label && swapMethodSignatures.some(sig => tx.method_label?.toLowerCase().includes(sig.toLowerCase()));
  
  const dexRouterAddresses = [
    '0xda9aba4eacf54e0273f56dfffee6b8f1e20b23bba', // PulseX Router
    '0x165c3410fc91ef562c50559f7d2289febb913d90', // PulseX Router V2
    '0x98bf93ebf5c380c0e6ae8e192a7e2ae08edacc02', // PulseX Factory
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router
  ];
  const isDexRouter = dexRouterAddresses.includes(tx.to_address?.toLowerCase() || '');
  
  const hasSendTransfers = tx.erc20_transfers?.some(t => t && t.direction === 'send');
  const hasReceiveTransfers = tx.erc20_transfers?.some(t => t && t.direction === 'receive');
  
  // Enhanced swap detection - if we have both sends and receives, it's likely a swap
  if ((isSwapMethod || isDexRouter) || (hasSendTransfers && hasReceiveTransfers)) {
    return 'swap';
  }
  
  // Check for approvals
  if (tx.method_label?.toLowerCase().includes('approve')) {
    return 'approval';
  }
  
  // Check for sends/receives
  if (hasSendTransfers && !hasReceiveTransfers) return 'send';
  if (hasReceiveTransfers && !hasSendTransfers) return 'receive';
  
  // Check for contract interactions
  if (tx.to_address && (tx.value === '0' || tx.value === '') && !tx.erc20_transfers?.length) {
    return 'contract';
  }
  
  // Native PLS transfers
  if (tx.value && tx.value !== '0' && !tx.erc20_transfers?.length) {
    return tx.from_address.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive';
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
  
  // Fetch initial transactions using scanner endpoint for instant loading
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/wallet/${walletAddress}/scanner-transactions`, { limit: 200 }],
    queryFn: async () => {
      const url = `/api/wallet/${walletAddress}/scanner-transactions?limit=200`;
      console.log(`Fetching scanner transactions: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch scanner transactions');
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
      setCursor(data.cursor || data.nextCursor || data.lastBlock || null);
      setHasMore(!!(data.cursor || data.nextCursor || data.hasMore));
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
            
            {/* Transaction Method Label */}
            {tx.method_label && (
              <div className="mb-2">
                <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md">
                  {tx.method_label}
                </span>
              </div>
            )}
            
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
                  
                  // Skip native PLS transfers when we already counted tx.value
                  // This prevents double-counting in swap transactions
                  if (transfer.address === 'native' && 
                      tx.value && tx.value !== '0' && 
                      tx.from_address.toLowerCase() === walletAddress.toLowerCase() &&
                      transfer.from_address?.toLowerCase() === walletAddress.toLowerCase() &&
                      transfer.value === tx.value) {
                    console.log('Skipping native transfer that matches tx.value to prevent double-counting');
                    return;
                  }
                  
                  // Skip ALL WPLS transfers in swap transactions
                  // We only want to show the initial PLS transfer, not the WPLS conversion
                  if (isSwapTx && isWPLS) {
                    console.log('Skipping WPLS transfer in swap - only showing initial PLS');
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
                
                // Determine transaction type and display accordingly
                const txType = getTransactionType(tx, walletAddress);
                
                // For swaps - show both tokens with USD values
                if (txType === 'swap' && primarySent && primaryReceived) {
                  return (
                    <div className="space-y-2 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <RefreshCw className="text-purple-400" size={16} />
                        <span className="font-semibold text-purple-400">SWAP</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        {/* From Token */}
                        <div className="flex items-center gap-2">
                          <TokenLogo 
                            address={primarySent.address === 'native' ? '' : primarySent.address}
                            symbol={primarySent.symbol}
                            logo={primarySent.logo}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-white">
                              {formatTokenValue(primarySent.netAmount.toString(), primarySent.decimals)} {primarySent.symbol}
                            </div>
                            {(() => {
                              const tokenAddr = primarySent.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primarySent.address;
                              const usdValue = calculateUsdValue(primarySent.netAmount.toString(), primarySent.decimals, tokenAddr);
                              if (usdValue !== null && usdValue >= 0.01) {
                                return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        
                        <ArrowRight size={16} className="text-gray-400 hidden sm:block" />
                        
                        {/* To Token */}
                        <div className="flex items-center gap-2">
                          <TokenLogo 
                            address={primaryReceived.address === 'native' ? '' : primaryReceived.address}
                            symbol={primaryReceived.symbol}
                            logo={primaryReceived.logo}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-white">
                              {formatTokenValue(primaryReceived.netAmount.toString(), primaryReceived.decimals)} {primaryReceived.symbol}
                            </div>
                            {(() => {
                              const tokenAddr = primaryReceived.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primaryReceived.address;
                              const usdValue = calculateUsdValue(primaryReceived.netAmount.toString(), primaryReceived.decimals, tokenAddr);
                              if (usdValue !== null && usdValue >= 0.01) {
                                return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // For transfers - show clear from/to addresses
                if ((txType === 'send' || txType === 'receive') && (primarySent || primaryReceived)) {
                  const token = primarySent || primaryReceived;
                  const isSend = !!primarySent;
                  const relevantTransfer = tx.erc20_transfers?.find(t => 
                    t.address?.toLowerCase() === token?.address?.toLowerCase() ||
                    (token?.address === 'native' && !t.address)
                  );
                  
                  return (
                    <div className="space-y-2 bg-gray-500/5 border border-gray-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm">
                        {isSend ? (
                          <>
                            <ArrowUpRight className="text-red-400" size={16} />
                            <span className="font-semibold text-red-400">SENT</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="text-green-400" size={16} />
                            <span className="font-semibold text-green-400">RECEIVED</span>
                          </>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <TokenLogo 
                          address={token.address === 'native' ? '' : token.address}
                          symbol={token.symbol}
                          logo={token.logo}
                          size="sm"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-white">
                            {formatTokenValue(token.netAmount.toString(), token.decimals)} {token.symbol}
                          </div>
                          {(() => {
                            const tokenAddr = token.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : token.address;
                            const usdValue = calculateUsdValue(token.netAmount.toString(), token.decimals, tokenAddr);
                            if (usdValue !== null && usdValue >= 0.01) {
                              return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      
                      {/* Show from/to addresses */}
                      <div className="text-xs text-gray-400 space-y-1">
                        {isSend ? (
                          <div className="flex items-center gap-1">
                            <span>To:</span>
                            <button
                              onClick={() => copyToClipboard(relevantTransfer?.to_address || tx.to_address)}
                              className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                            >
                              <span className="font-mono">
                                {relevantTransfer?.to_address_label || shortenAddress(relevantTransfer?.to_address || tx.to_address)}
                              </span>
                              {copiedAddresses[relevantTransfer?.to_address || tx.to_address] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span>From:</span>
                            <button
                              onClick={() => copyToClipboard(relevantTransfer?.from_address || tx.from_address)}
                              className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                            >
                              <span className="font-mono">
                                {relevantTransfer?.from_address_label || shortenAddress(relevantTransfer?.from_address || tx.from_address)}
                              </span>
                              {copiedAddresses[relevantTransfer?.from_address || tx.from_address] ? (
                                <Check size={12} className="text-green-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                
                // For approvals - show token being approved
                if (txType === 'approval') {
                  // Try to decode approval data from transaction
                  const approvalToken = (() => {
                    // First check if this is a token contract that's being interacted with
                    // In most cases, the to_address is the token being approved
                    const tokenAddress = tx.from_address; // The token contract address for approve calls
                    
                    // Look for any transfers in this transaction
                    const recentTransfer = tx.erc20_transfers?.find(t => t);
                    if (recentTransfer) {
                      return {
                        address: recentTransfer.address || '',
                        symbol: recentTransfer.token_symbol || 'Unknown',
                        logo: recentTransfer.token_logo || prefetchedLogos[recentTransfer.address?.toLowerCase() || '']
                      };
                    }
                    
                    // If no transfers, try to find token info from prefetched logos
                    if (tokenAddress && prefetchedLogos[tokenAddress.toLowerCase()]) {
                      return {
                        address: tokenAddress,
                        symbol: 'Token',
                        logo: prefetchedLogos[tokenAddress.toLowerCase()]
                      };
                    }
                    
                    return null;
                  })();
                  
                  return (
                    <div className="space-y-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="text-yellow-400" size={16} />
                        <span className="font-semibold text-yellow-400">APPROVAL</span>
                      </div>
                      {approvalToken && (
                        <div className="flex items-center gap-2">
                          <TokenLogo 
                            address={approvalToken.address}
                            symbol={approvalToken.symbol}
                            logo={approvalToken.logo}
                            size="sm"
                          />
                          <span className="text-white font-medium">{approvalToken.symbol}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-400 space-y-1">
                        <div className="flex items-center gap-1">
                          <span>Approved to:</span>
                          <button
                            onClick={() => copyToClipboard(tx.to_address)}
                            className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                          >
                            <span className="font-mono">
                              {tx.to_address_label || shortenAddress(tx.to_address)}
                            </span>
                            {copiedAddresses[tx.to_address] ? (
                              <Check size={12} className="text-green-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // For multicalls - show tokens sent from user and received by user
                if (tx.method_label?.toLowerCase().includes('multicall')) {
                  // For multicalls, we need to filter transfers more carefully
                  // Only count tokens that actually left/entered the user's wallet
                  const userSentTokens: typeof sentTokens = [];
                  const userReceivedTokens: typeof receivedTokens = [];
                  
                  // Process transfers to identify what the user actually sent/received
                  tx.erc20_transfers?.forEach(transfer => {
                    // Skip internal/intermediate transfers that are part of the routing
                    // We only care about transfers directly from or to the user
                    if (transfer.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
                      // User sent this token
                      const tokenKey = transfer.address || 'native';
                      const existingToken = userSentTokens.find(t => t.address === tokenKey);
                      
                      let amount: bigint;
                      try {
                        amount = BigInt(transfer.value || '0');
                      } catch {
                        amount = BigInt(0);
                      }
                      
                      if (existingToken) {
                        existingToken.netAmount += amount;
                      } else {
                        userSentTokens.push({
                          symbol: transfer.token_symbol || 'Unknown',
                          name: transfer.token_name,
                          logo: transfer.token_logo || prefetchedLogos[transfer.address?.toLowerCase() || ''],
                          decimals: transfer.token_decimals || '18',
                          netAmount: amount,
                          address: tokenKey
                        });
                      }
                    } else if (transfer.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
                      // User received this token
                      const tokenKey = transfer.address || 'native';
                      const existingToken = userReceivedTokens.find(t => t.address === tokenKey);
                      
                      let amount: bigint;
                      try {
                        amount = BigInt(transfer.value || '0');
                      } catch {
                        amount = BigInt(0);
                      }
                      
                      if (existingToken) {
                        existingToken.netAmount += amount;
                      } else {
                        userReceivedTokens.push({
                          symbol: transfer.token_symbol || 'Unknown',
                          name: transfer.token_name,
                          logo: transfer.token_logo || prefetchedLogos[transfer.address?.toLowerCase() || ''],
                          decimals: transfer.token_decimals || '18',
                          netAmount: amount,
                          address: tokenKey
                        });
                      }
                    }
                  });
                  
                  // Also check native transfers
                  tx.native_transfers?.forEach(transfer => {
                    if (transfer.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
                      // User sent native PLS
                      const existingToken = userSentTokens.find(t => t.address === 'native');
                      
                      let amount: bigint;
                      try {
                        amount = BigInt(transfer.value || '0');
                      } catch {
                        amount = BigInt(0);
                      }
                      
                      if (existingToken) {
                        existingToken.netAmount += amount;
                      } else {
                        userSentTokens.push({
                          symbol: 'PLS',
                          name: 'PulseChain',
                          logo: '/assets/pls logo trimmed.png',
                          decimals: '18',
                          netAmount: amount,
                          address: 'native'
                        });
                      }
                    } else if (transfer.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
                      // User received native PLS
                      const existingToken = userReceivedTokens.find(t => t.address === 'native');
                      
                      let amount: bigint;
                      try {
                        amount = BigInt(transfer.value || '0');
                      } catch {
                        amount = BigInt(0);
                      }
                      
                      if (existingToken) {
                        existingToken.netAmount += amount;
                      } else {
                        userReceivedTokens.push({
                          symbol: 'PLS',
                          name: 'PulseChain',
                          logo: '/assets/pls logo trimmed.png',
                          decimals: '18',
                          netAmount: amount,
                          address: 'native'
                        });
                      }
                    }
                  });
                  
                  // If we found clear user transfers, display them
                  if (userSentTokens.length > 0 || userReceivedTokens.length > 0) {
                    return (
                      <div className="space-y-2 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm">
                          <RefreshCw className="text-purple-400" size={16} />
                          <span className="font-semibold text-purple-400">MULTICALL SWAP</span>
                        </div>
                        
                        {/* Show what user sent */}
                        {userSentTokens.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs text-gray-400">You sent:</span>
                            {userSentTokens.map((token, idx) => (
                              <div key={`sent-${idx}`} className="flex items-center gap-2 ml-4">
                                <TokenLogo 
                                  address={token.address === 'native' ? '' : token.address}
                                  symbol={token.symbol}
                                  logo={token.logo}
                                  size="sm"
                                />
                                <div>
                                  <div className="font-medium text-white text-sm">
                                    {formatTokenValue(token.netAmount.toString(), token.decimals)} {token.symbol}
                                  </div>
                                  {(() => {
                                    const tokenAddr = token.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : token.address;
                                    const usdValue = calculateUsdValue(token.netAmount.toString(), token.decimals, tokenAddr);
                                    if (usdValue !== null && usdValue >= 0.01) {
                                      return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {userSentTokens.length > 0 && userReceivedTokens.length > 0 && (
                          <ArrowRight size={14} className="text-gray-400 ml-4" />
                        )}
                        
                        {/* Show what user received */}
                        {userReceivedTokens.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs text-gray-400">You received:</span>
                            {userReceivedTokens.map((token, idx) => (
                              <div key={`received-${idx}`} className="flex items-center gap-2 ml-4">
                                <TokenLogo 
                                  address={token.address === 'native' ? '' : token.address}
                                  symbol={token.symbol}
                                  logo={token.logo}
                                  size="sm"
                                />
                                <div>
                                  <div className="font-medium text-white text-sm">
                                    {formatTokenValue(token.netAmount.toString(), token.decimals)} {token.symbol}
                                  </div>
                                  {(() => {
                                    const tokenAddr = token.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : token.address;
                                    const usdValue = calculateUsdValue(token.netAmount.toString(), token.decimals, tokenAddr);
                                    if (usdValue !== null && usdValue >= 0.01) {
                                      return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Fall back to showing as a regular swap if we have the data
                  if (sentTokens.length > 0 && receivedTokens.length > 0) {
                    return (
                      <div className="space-y-2 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm">
                          <RefreshCw className="text-purple-400" size={16} />
                          <span className="font-semibold text-purple-400">MULTICALL SWAP</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          {/* From Token */}
                          <div className="flex items-center gap-2">
                            <TokenLogo 
                              address={primarySent.address === 'native' ? '' : primarySent.address}
                              symbol={primarySent.symbol}
                              logo={primarySent.logo}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-white">
                                {formatTokenValue(primarySent.netAmount.toString(), primarySent.decimals)} {primarySent.symbol}
                              </div>
                              {(() => {
                                const tokenAddr = primarySent.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primarySent.address;
                                const usdValue = calculateUsdValue(primarySent.netAmount.toString(), primarySent.decimals, tokenAddr);
                                if (usdValue !== null && usdValue >= 0.01) {
                                  return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                          
                          <ArrowRight size={16} className="text-gray-400 hidden sm:block" />
                          
                          {/* To Token */}
                          <div className="flex items-center gap-2">
                            <TokenLogo 
                              address={primaryReceived.address === 'native' ? '' : primaryReceived.address}
                              symbol={primaryReceived.symbol}
                              logo={primaryReceived.logo}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-white">
                                {formatTokenValue(primaryReceived.netAmount.toString(), primaryReceived.decimals)} {primaryReceived.symbol}
                              </div>
                              {(() => {
                                const tokenAddr = primaryReceived.address === 'native' ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : primaryReceived.address;
                                const usdValue = calculateUsdValue(primaryReceived.netAmount.toString(), primaryReceived.decimals, tokenAddr);
                                if (usdValue !== null && usdValue >= 0.01) {
                                  return <div className="text-xs text-gray-400">{formatCurrency(usdValue)}</div>;
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                }
                
                // For contract interactions without token transfers
                if (txType === 'contract' && !primarySent && !primaryReceived) {
                  return (
                    <div className="space-y-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Wallet className="text-blue-400" size={16} />
                        <span className="font-semibold text-blue-400">CONTRACT INTERACTION</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <span>Contract:</span>
                          <button
                            onClick={() => copyToClipboard(tx.to_address)}
                            className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                          >
                            <span className="font-mono">
                              {tx.to_address_label || shortenAddress(tx.to_address)}
                            </span>
                            {copiedAddresses[tx.to_address] ? (
                              <Check size={12} className="text-green-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // Fallback for other transaction types
                return (
                  <div className="flex items-center gap-2">
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
                const url = `/api/wallet/${walletAddress}/scanner-transactions?limit=200${cursor ? `&cursor=${cursor}` : ''}`;
                console.log(`Loading more scanner transactions: ${url}`);
                const response = await fetch(url);
                
                if (!response.ok) {
                  throw new Error('Failed to load more transactions');
                }
                
                const data = await response.json();
                if (data.transactions) {
                  setTransactions([...transactions, ...data.transactions]);
                  setCursor(data.nextCursor || null);
                  setHasMore(!!data.nextCursor);
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