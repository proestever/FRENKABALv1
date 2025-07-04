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

const getTransactionType = (tx: Transaction): TransactionType => {
  // Check for swaps using enhanced detection
  const swapInfo = detectTokenSwap(tx);
  if (swapInfo) {
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

// Enhanced token swap detection with multicall support
const detectTokenSwap = (tx: Transaction) => {
  // First check if method label indicates a swap
  const swapMethodSignatures = ['swap', 'trade', 'multicall', 'exactinput', 'exactoutput', 'swapexact', 'swaptokens'];
  const isSwapMethod = tx.method_label && swapMethodSignatures.some(sig => tx.method_label?.toLowerCase().includes(sig));
  
  // Check for DEX router contracts
  const dexRouterAddresses = [
    '0xda9aba4eacf54e0273f56dfffee6b8f1e20b23bba', // PulseX Router
    '0x165c3410fc91ef562c50559f7d2289febb913d90', // PulseX Router V2
    '0x98bf93ebf5c380c0e6ae8e192a7e2ae08edacc02', // PulseX Factory
  ];
  const isDexRouter = dexRouterAddresses.includes(tx.to_address?.toLowerCase() || '');
  
  if (!tx.erc20_transfers || tx.erc20_transfers.length < 2) {
    // For multicalls without visible transfers, still show as swap if it's a DEX interaction
    if ((isSwapMethod || isDexRouter) && tx.to_address_label?.includes('PulseX')) {
      return {
        type: 'swap',
        sentTokens: [],
        receivedTokens: [],
        dexName: tx.to_address_label || 'PulseX',
        isMulticall: true
      };
    }
    return null;
  }
  
  const sentTokens = tx.erc20_transfers.filter(t => t && t.direction === 'send');
  const receivedTokens = tx.erc20_transfers.filter(t => t && t.direction === 'receive');
  
  // A swap typically has tokens going out and different tokens coming in
  if (sentTokens.length > 0 && receivedTokens.length > 0) {
    // Filter out LP tokens and intermediate transfers
    const filteredSent = sentTokens.filter(t => 
      !t.token_symbol?.includes('LP') && 
      !t.token_symbol?.toLowerCase().includes('pulsex')
    );
    const filteredReceived = receivedTokens.filter(t => 
      !t.token_symbol?.includes('LP') && 
      !t.token_symbol?.toLowerCase().includes('pulsex')
    );
    
    // Check if tokens are different (not just the same token moving around)
    const sentAddresses = new Set(filteredSent.map(t => t.address?.toLowerCase()));
    const receivedAddresses = new Set(filteredReceived.map(t => t.address?.toLowerCase()));
    
    // If there are different tokens involved, it's likely a swap
    const hasOverlap = Array.from(sentAddresses).some(addr => receivedAddresses.has(addr));
    
    if (!hasOverlap || sentAddresses.size + receivedAddresses.size > 2 || isSwapMethod || isDexRouter) {
      return {
        type: 'swap',
        sentTokens: filteredSent.length > 0 ? filteredSent : sentTokens,
        receivedTokens: filteredReceived.length > 0 ? filteredReceived : receivedTokens,
        dexName: tx.to_address_label || (isDexRouter ? 'PulseX' : 'DEX'),
        isMulticall: isSwapMethod && tx.method_label?.includes('multicall')
      };
    }
  }
  
  return null;
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
  
  // Fetch initial transactions
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/wallet/${walletAddress}/transactions`, { limit: 150 }],
    queryFn: () => fetchTransactionHistory(walletAddress, 150),
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
    if (!tokenAddress || !batchPrices || !batchPrices[tokenAddress.toLowerCase()]) return null;
    
    const price = batchPrices[tokenAddress.toLowerCase()];
    const decimalCount = parseInt(decimals || '18');
    const numValue = parseFloat(value) / Math.pow(10, decimalCount);
    
    return numValue * price;
  };
  
  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesType = typeFilter === 'all' || getTransactionType(tx) === typeFilter;
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
    if (data?.result) {
      setTransactions(data.result);
      setCursor(data.cursor || null);
      setHasMore(!!data.cursor);
    }
  }, [data]);
  
  // Enhanced token display component
  const TokenTransferDisplay = ({ transfer, index }: { transfer: TransactionTransfer; index: number }) => (
    <div className="flex items-start mt-3 p-3 rounded-lg bg-black/20 border border-white/5">
      <TokenLogo 
        address={transfer.address || ''}
        symbol={transfer.token_symbol || ''}
        fallbackLogo={transfer.token_logo || prefetchedLogos[transfer.address?.toLowerCase() || '']}
        size="md"
      />
      <div className="ml-3 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {transfer.direction === 'receive' ? (
              <ArrowDownLeft size={16} className="text-green-400" />
            ) : (
              <ArrowUpRight size={16} className="text-red-400" />
            )}
            <span className={`font-semibold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
              {transfer.direction === 'receive' ? '+' : '-'}
              {formatTokenValue(transfer.value, transfer.token_decimals)}
            </span>
          </div>
          {/* USD Value */}
          {(() => {
            const usdValue = calculateUsdValue(transfer.value, transfer.token_decimals, transfer.address || '');
            return usdValue ? (
              <span className={`text-sm ${transfer.direction === 'receive' ? 'text-green-300/70' : 'text-red-300/70'}`}>
                {transfer.direction === 'receive' ? '+' : '-'}{formatCurrency(usdValue)}
              </span>
            ) : null;
          })()}
        </div>
        
        {/* Enhanced Token Details */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Token:</span>
            <span className="text-white font-medium">{transfer.token_name || 'Unknown Token'}</span>
            <span className="text-gray-300">({transfer.token_symbol || 'UNKNOWN'})</span>
          </div>
          
          {/* Contract Address with Copy */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Contract:</span>
            <div className="flex items-center gap-1">
              <span className="text-gray-300 font-mono text-xs">
                {shortenAddress(transfer.address || '')}
              </span>
              <button
                onClick={() => copyToClipboard(transfer.address || '', `token-${index}`)}
                className="text-gray-400 hover:text-white transition-colors"
                title="Copy contract address"
              >
                {copiedAddresses[`token-${index}`] ? (
                  <Check size={12} className="text-green-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
              <a
                href={`https://scan.pulsechain.com/token/${transfer.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
                title="View on PulseScan"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
          
          {/* From/To Address */}
          <div className="text-xs text-muted-foreground">
            {transfer.direction === 'receive' ? 'From: ' : 'To: '}
            <Link 
              to={`/${transfer.direction === 'receive' ? transfer.from_address : transfer.to_address}`} 
              className="text-white hover:text-gray-300"
            >
              {shortenAddress(transfer.direction === 'receive' ? transfer.from_address : transfer.to_address)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
  
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
      <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
        {filteredTransactions.map((tx, index) => (
          <div key={`${tx.hash}-${index}`} className="p-4 hover:bg-white/5 transition-colors">
            {/* Transaction Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <a 
                  href={`https://otter.pulsechain.com/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                >
                  {shortenAddress(tx.hash)}
                  <ExternalLink size={12} />
                </a>
                <span className="text-xs text-muted-foreground">
                  {formatDate(parseInt(tx.block_timestamp) * 1000)}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                Block #{parseInt(tx.block_number).toLocaleString()}
              </div>
            </div>
            
            {/* Transaction Content */}
            <div className="space-y-2">
              {/* Swap Detection */}
              {(() => {
                const swapInfo = detectTokenSwap(tx);
                
                if (swapInfo) {
                  // Handle multicall swaps without visible transfers
                  if (swapInfo.isMulticall && swapInfo.sentTokens.length === 0 && swapInfo.receivedTokens.length === 0) {
                    // Try to extract token information from transaction summary or method
                    let tokenOut = 'Unknown';
                    let tokenIn = 'Unknown';
                    
                    // If transaction has value, PLS is likely going out
                    if (tx.value && tx.value !== '0') {
                      tokenOut = 'PLS';
                    }
                    
                    // Try to extract from summary
                    if (tx.summary) {
                      // Look for patterns like "Swap 100 PLS for 50 HEX"
                      const swapMatch = tx.summary.match(/swap\s+[\d.]+\s+(\w+)\s+for\s+[\d.]+\s+(\w+)/i);
                      if (swapMatch) {
                        tokenOut = swapMatch[1];
                        tokenIn = swapMatch[2];
                      }
                      // Look for patterns with arrows like "PLS → HEX"
                      const arrowMatch = tx.summary.match(/(\w+)\s*(?:→|->|›)\s*(\w+)/);
                      if (arrowMatch) {
                        tokenOut = arrowMatch[1];
                        tokenIn = arrowMatch[2];
                      }
                    }
                    
                    // Check if we have native transfers that might give us clues
                    if (tx.native_transfers && tx.native_transfers.length > 0) {
                      const hasSend = tx.native_transfers.some(t => t.direction === 'send');
                      const hasReceive = tx.native_transfers.some(t => t.direction === 'receive');
                      if (hasSend && !hasReceive) {
                        tokenOut = 'PLS';
                      }
                    }
                    
                    return (
                      <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <RefreshCw className="text-purple-400" size={16} />
                          <span className="font-medium text-purple-400">SWAPPED via {swapInfo.dexName || 'DEX'}</span>
                        </div>
                        
                        {/* Show what we know about the swap */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">Out:</span>
                          <span className="text-red-400 font-medium">
                            {tx.value && tx.value !== '0' ? `${formatTokenValue(tx.value, '18')} ` : ''}
                            {tokenOut}
                          </span>
                          <ArrowRight size={14} className="text-gray-400" />
                          <span className="text-gray-400">In:</span>
                          <span className="text-green-400 font-medium">{tokenIn}</span>
                        </div>
                        
                        {tokenOut === 'Unknown' && tokenIn === 'Unknown' && (
                          <div className="mt-2 text-xs text-gray-400">
                            Token details not visible in multicall transaction
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Handle swaps with visible token transfers
                  if (swapInfo.sentTokens.length > 0 && swapInfo.receivedTokens.length > 0) {
                    // Get primary tokens
                    const primarySent = swapInfo.sentTokens[0];
                    const primaryReceived = swapInfo.receivedTokens[0];
                    
                    return (
                      <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <RefreshCw className="text-purple-400" size={16} />
                          <span className="font-medium text-purple-400">SWAPPED</span>
                        </div>
                        
                        {/* Token Out */}
                        <div className="flex items-center gap-3 mb-2">
                          <TokenLogo 
                            address={primarySent.address || ''}
                            symbol={primarySent.token_symbol || 'Unknown'}
                            fallbackLogo={primarySent.token_logo !== null ? primarySent.token_logo : undefined}
                            size="sm"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <ArrowUpRight size={14} className="text-red-400" />
                              <span className="text-red-400 font-semibold">
                                -{formatTokenValue(primarySent.value, primarySent.token_decimals)}
                              </span>
                              <span className="text-white font-medium">{primarySent.token_symbol || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Token In */}
                        <div className="flex items-center gap-3">
                          <TokenLogo 
                            address={primaryReceived.address || ''}
                            symbol={primaryReceived.token_symbol || 'Unknown'}
                            fallbackLogo={primaryReceived.token_logo !== null ? primaryReceived.token_logo : undefined}
                            size="sm"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <ArrowDownLeft size={14} className="text-green-400" />
                              <span className="text-green-400 font-semibold">
                                +{formatTokenValue(primaryReceived.value, primaryReceived.token_decimals)}
                              </span>
                              <span className="text-white font-medium">{primaryReceived.token_symbol || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {swapInfo.dexName && (
                          <div className="mt-2 text-xs text-gray-400">
                            via {swapInfo.dexName}
                          </div>
                        )}
                      </div>
                    );
                  }
                }
                return null;
              })()}
              
              {/* ERC20 Transfers */}
              {(() => {
                const swapInfo = detectTokenSwap(tx);
                if (swapInfo && swapInfo.sentTokens.length > 0 && swapInfo.receivedTokens.length > 0) {
                  return null; // Don't show individual transfers if swap is detected
                }
                
                return tx.erc20_transfers && tx.erc20_transfers.map((transfer, i) => (
                  <TokenTransferDisplay key={`${tx.hash}-erc20-${i}`} transfer={transfer} index={i} />
                ));
              })()}
              
              {/* Native Transfers */}
              {tx.native_transfers && tx.native_transfers.map((transfer, i) => (
                <div key={`${tx.hash}-native-${i}`} className="flex items-center gap-3 p-2 rounded-lg bg-black/10">
                  <img 
                    src="/assets/pls-logo-trimmed.png"
                    alt="PLS"
                    className="w-6 h-6 rounded-full"
                  />
                  <div className="flex items-center gap-2">
                    {transfer.direction === 'receive' ? (
                      <ArrowDownLeft size={14} className="text-green-400" />
                    ) : (
                      <ArrowUpRight size={14} className="text-red-400" />
                    )}
                    <span className={`font-semibold ${transfer.direction === 'receive' ? 'text-green-400' : 'text-red-400'}`}>
                      {transfer.direction === 'receive' ? '+' : '-'}
                      {formatTokenValue(transfer.value)} PLS
                    </span>
                  </div>
                </div>
              ))}
              
              {/* Transaction Details */}
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>Gas: {parseInt(tx.receipt_gas_used).toLocaleString()}</span>
                <span>Fee: {formatTokenValue(tx.transaction_fee)} PLS</span>
                {tx.receipt_status === '0' && (
                  <span className="text-red-400">Failed</span>
                )}
              </div>
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
                const response = await fetchTransactionHistory(walletAddress, 150, cursor);
                if (response.result) {
                  setTransactions([...transactions, ...response.result]);
                  setCursor(response.cursor || null);
                  setHasMore(!!response.cursor);
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