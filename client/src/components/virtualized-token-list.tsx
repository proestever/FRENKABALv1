import { CSSProperties, memo, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { formatCurrency, formatCurrencyWithPrecision, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass } from '@/lib/utils';
import { formatTokenPrice } from '@/lib/format';
import { TokenLogo } from '@/components/token-logo';
import { LpTokenDisplay } from '@/components/lp-token-display';
import { TokenActionsMenu } from '@/components/token-actions-menu';
import { Eye, EyeOff, Wallet, ArrowUpDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Use the same Token type that TokenList uses
interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  isLp?: boolean;
  verified?: boolean;
  walletCount?: number;
  walletHoldings?: Array<{
    address: string;
    amount: number;
    value: number;
  }>;
}

interface VirtualizedTokenListProps {
  tokens: Token[];
  hiddenTokens: string[];
  logoUrls: Record<string, string>;
  onToggleVisibility: (tokenAddress: string) => void;
  walletAddress?: string;
  isMultiWallet?: boolean;
  showLiquidity?: boolean;
}

interface RowProps {
  index: number;
  style: CSSProperties;
  data: {
    tokens: Token[];
    hiddenTokens: string[];
    logoUrls: Record<string, string>;
    onToggleVisibility: (tokenAddress: string) => void;
    walletAddress?: string;
    isMultiWallet?: boolean;
    showLiquidity?: boolean;
  };
}

// Memoized row component for performance
const Row = memo(({ index, style, data }: RowProps) => {
  const { tokens, hiddenTokens, logoUrls, onToggleVisibility, walletAddress, isMultiWallet, showLiquidity } = data;
  const token = tokens[index];
  
  if (!token) return null;
  
  const isHidden = hiddenTokens.includes(token.address);
  const logoUrl = logoUrls[token.address];
  
  // Special handling for LP tokens in liquidity view
  if (showLiquidity && token.isLp) {
    return (
      <div style={style} className="px-4 py-2">
        <LpTokenDisplay 
          token={token} 
          walletAddress={walletAddress}
        />
      </div>
    );
  }

  return (
    <div style={style} className="flex items-center justify-between px-4 py-2 hover:bg-accent/50 transition-colors">
      {/* Token Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <TokenLogo address={token.address} symbol={token.symbol} size="md" logo={logoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{token.symbol}</span>
            {isHidden && <EyeOff className="h-3 w-3 text-muted-foreground" />}
            {token.isLp && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                LP
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">{token.name}</div>
          
          {/* Multi-wallet indicator */}
          {isMultiWallet && token.walletCount && token.walletCount > 1 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 cursor-help">
                    <Wallet className="h-3 w-3" />
                    <span>{token.walletCount} wallets</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="space-y-1">
                    {token.walletHoldings?.map((holding, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-mono">{holding.address.slice(0, 6)}...{holding.address.slice(-4)}</span>
                        <span className="ml-2">{formatTokenAmount(holding.amount)} ({formatCurrency(holding.value)})</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Balance & Value */}
      <div className="text-right flex-shrink-0 ml-4">
        <div className="font-medium">
          {token.value !== undefined ? formatCurrency(token.value) : '-'}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatTokenAmount(token.balanceFormatted)}
        </div>
      </div>

      {/* Price & Change */}
      <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
        <div className="text-sm">
          {token.price !== undefined ? formatTokenPrice(token.price) : '-'}
        </div>
        {token.priceChange24h !== undefined && (
          <div className={`text-xs ${getAdvancedChangeClass(token.priceChange24h)}`}>
            {token.priceChange24h > 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 ml-4">
        <TokenActionsMenu 
          tokenAddress={token.address}
          tokenName={token.name}
          tokenSymbol={token.symbol}
        >
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(token.address);
            }}
            className="p-1 hover:bg-accent rounded"
          >
            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </TokenActionsMenu>
      </div>
    </div>
  );
});

Row.displayName = 'TokenRow';

export function VirtualizedTokenList({
  tokens,
  hiddenTokens,
  logoUrls,
  onToggleVisibility,
  walletAddress,
  isMultiWallet,
  showLiquidity,
}: VirtualizedTokenListProps) {
  // Calculate list height based on viewport
  const getListHeight = useCallback(() => {
    // Reserve space for header, filters, and other UI elements
    const reservedHeight = 400; 
    const viewportHeight = window.innerHeight;
    return Math.max(400, viewportHeight - reservedHeight);
  }, []);

  // Row height for each token
  const rowHeight = showLiquidity ? 120 : 72;

  // Memoize the data object to prevent unnecessary re-renders
  const itemData = useMemo(() => ({
    tokens,
    hiddenTokens,
    logoUrls,
    onToggleVisibility,
    walletAddress,
    isMultiWallet,
    showLiquidity,
  }), [tokens, hiddenTokens, logoUrls, onToggleVisibility, walletAddress, isMultiWallet, showLiquidity]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-muted-foreground">
        <div className="flex-1">Token</div>
        <div className="text-right flex-shrink-0 ml-4">Balance</div>
        <div className="text-right flex-shrink-0 ml-4 hidden sm:block">Price</div>
        <div className="w-8 flex-shrink-0 ml-4"></div>
      </div>

      {/* Virtual List */}
      <List
        height={getListHeight()}
        itemCount={tokens.length}
        itemSize={rowHeight}
        width="100%"
        itemData={itemData}
        className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-background"
      >
        {Row}
      </List>
    </div>
  );
}