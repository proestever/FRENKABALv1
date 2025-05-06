import React, { useState } from 'react';
import { Token } from '@shared/schema';
import { TokenLogo } from './token-logo';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';

interface LpTokenDisplayProps {
  token: Token;
  size?: 'sm' | 'md' | 'lg';
  expanded?: boolean;
  showDetails?: boolean;
}

export function LpTokenDisplay({ token, size = 'md', expanded = false, showDetails = false }: LpTokenDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const logoSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
  
  if (!token.isLp) {
    return (
      <TokenLogo 
        address={token.address} 
        symbol={token.symbol} 
        size={logoSize} 
      />
    );
  }

  // Get token pair information
  const token0Symbol = token.lpToken0Symbol || '?';
  const token1Symbol = token.lpToken1Symbol || '?';
  
  // Determine if we have a valid token pair
  const hasValidPair = token.lpToken0Symbol && token.lpToken1Symbol;
  
  // Prepare tokens data for display
  const token0BalanceFormatted = token.lpToken0BalanceFormatted;
  const token1BalanceFormatted = token.lpToken1BalanceFormatted;
  
  const token0Value = token.lpToken0Value;
  const token1Value = token.lpToken1Value;
  
  const hasDetailedData = !!(token0BalanceFormatted || token1BalanceFormatted);
  
  // Get PulseX LP pool URL if possible
  const getPulseXPoolUrl = () => {
    return `https://scan.pulsechain.com/token/${token.address}`;
  };

  // Toggle expanded state
  const toggleExpand = (e: React.MouseEvent) => {
    if (showDetails && hasDetailedData) {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
    }
  };
  
  // Dual tokens icon display for LP tokens
  const renderDualTokensIcon = () => (
    <div className="relative">
      <TokenLogo 
        address={token.address} 
        symbol={token.symbol} 
        size={logoSize} 
      />
      
      {/* PulseX indicator badge */}
      <div className="absolute -top-1 -right-1 bg-gradient-to-br from-primary to-accent text-white text-[8px] px-1 rounded-sm font-bold">
        PLP
      </div>
    </div>
  );
  
  // Simple LP token display (for non-expanded view)
  const renderSimpleDisplay = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        {/* Dual token logos in the collapsed view */}
        <div className="relative">
          {hasValidPair && token.lpToken0Address && token.lpToken1Address ? (
            <div className="flex relative">
              <div className="z-10">
                <TokenLogo 
                  address={token.lpToken0Address} 
                  symbol={token0Symbol} 
                  size={size === 'sm' ? 'xs' : 'sm'} 
                />
              </div>
              <div className="absolute left-3">
                <TokenLogo 
                  address={token.lpToken1Address} 
                  symbol={token1Symbol} 
                  size={size === 'sm' ? 'xs' : 'sm'} 
                />
              </div>
            </div>
          ) : (
            renderDualTokensIcon()
          )}
          
          {/* PulseX indicator badge */}
          <div className="absolute -top-1 -right-1 bg-gradient-to-br from-primary to-accent text-white text-[8px] px-1 rounded-sm font-bold">
            PLP
          </div>
        </div>
        
        {/* LP Token details - more compact */}
        <div className={`flex flex-col ml-3 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {hasValidPair ? (
            <div className="font-medium flex items-center">
              <span className="text-token0-color font-semibold">{token0Symbol}</span>
              <span className="mx-0.5">/</span>
              <span className="text-token1-color font-semibold">{token1Symbol}</span>
              <a 
                href={getPulseXPoolUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <span className="font-medium">{token.symbol}</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center">
        {/* Value display with gradient background */}
        {token.value !== undefined && (
          <span className="bg-gradient-to-r from-token0-color/30 to-token1-color/30 text-white px-2 py-0.5 rounded-sm font-semibold text-xs">
            {formatCurrency(token.value)}
          </span>
        )}
        
        {/* Show expand button if we have detailed data and showDetails is true */}
        {showDetails && hasDetailedData && (
          <button 
            onClick={toggleExpand}
            className="ml-2 text-white/60 hover:text-white/90 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
    </div>
  );

  // Detailed LP token display with breakdown
  const renderDetailedDisplay = () => {
    if (!showDetails || !hasDetailedData || !isExpanded) {
      return null;
    }
    
    // Calculate pool share percentage if possible
    let poolSharePercentage: string | null = null;
    if (token.lpTotalSupply && token.balance) {
      try {
        const userBalance = BigInt(token.balance);
        const totalSupply = BigInt(token.lpTotalSupply);
        const sharePercentage = Number(userBalance * BigInt(10000) / totalSupply) / 100;
        if (!isNaN(sharePercentage)) {
          poolSharePercentage = sharePercentage.toFixed(2);
        }
      } catch (e) {
        // Fall back to not showing pool share if calculation fails
      }
    }
    
    return (
      <div className="mt-2 pl-2 border-l border-primary/40 text-xs">
        {/* Compact LP position summary */}
        <div className="flex items-center justify-between py-1">
          <div className="text-white/70 font-medium">Your position</div>
          {poolSharePercentage && (
            <div className="text-primary font-medium">
              {poolSharePercentage}% of pool
            </div>
          )}
        </div>
        
        {/* More compact token display */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {/* Token 0 */}
          <div className="bg-white/5 rounded p-2">
            <div className="flex items-center gap-1.5">
              <TokenLogo address={token.lpToken0Address || ''} symbol={token0Symbol} size="xs" />
              <div className="font-medium text-token0-color">
                {formatTokenAmount(token0BalanceFormatted || 0)} {token0Symbol}
              </div>
            </div>
            {token0Value !== undefined && (
              <div className="text-white/70 text-right mt-1">
                {formatCurrency(token0Value)}
              </div>
            )}
          </div>
          
          {/* Token 1 */}
          <div className="bg-white/5 rounded p-2">
            <div className="flex items-center gap-1.5">
              <TokenLogo address={token.lpToken1Address || ''} symbol={token1Symbol} size="xs" />
              <div className="font-medium text-token1-color">
                {formatTokenAmount(token1BalanceFormatted || 0)} {token1Symbol}
              </div>
            </div>
            {token1Value !== undefined && (
              <div className="text-white/70 text-right mt-1">
                {formatCurrency(token1Value)}
              </div>
            )}
          </div>
        </div>
        
        {/* Total Position Value */}
        <div className="flex justify-between items-center mt-2 py-1 border-t border-white/10">
          <span className="text-white/70">Total Value</span>
          <span className="bg-gradient-to-r from-token0-color/30 to-token1-color/30 px-2 py-0.5 rounded font-medium text-white">
            {token.value !== undefined ? formatCurrency(token.value) : 'Unknown'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {renderSimpleDisplay()}
      {renderDetailedDisplay()}
    </div>
  );
}