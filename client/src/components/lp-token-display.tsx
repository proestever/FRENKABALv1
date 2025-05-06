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
      
      {/* LP Token details */}
      <div className={`flex flex-col ml-4 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        <div className="font-medium">
          {hasValidPair ? (
            <span className="flex items-center">
              <span className="text-token0-color font-semibold">{token0Symbol}</span>
              <span className="mx-1">/</span>
              <span className="text-token1-color font-semibold">{token1Symbol}</span>
              <span className="ml-1 text-xs text-primary/80">LP</span>
            </span>
          ) : (
            <span>{token.symbol}</span>
          )}
        </div>
        <div className="text-muted-foreground text-xs flex items-center">
          <span>PulseX Pool</span>
          <a 
            href={getPulseXPoolUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={10} />
          </a>
          {token.value !== undefined && (
            <span className="ml-2 font-semibold">{formatCurrency(token.value)}</span>
          )}
        </div>
      </div>
      
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
  );

  // Detailed LP token display with breakdown
  const renderDetailedDisplay = () => {
    if (!showDetails || !hasDetailedData || !isExpanded) {
      return null;
    }
    
    return (
      <div className="mt-2 pl-2 border-l border-primary/40 text-sm">
        <div className="text-xs text-white/60 mb-1">Your position contains:</div>
        
        {/* Token 0 details */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center">
            <TokenLogo 
              address={token.lpToken0Address || ''} 
              symbol={token0Symbol} 
              size="sm" 
            />
            <div className="ml-1.5">
              <div className="font-medium">{token0Symbol}</div>
              <div className="text-xs text-white/60">
                {token0BalanceFormatted !== undefined 
                  ? formatTokenAmount(token0BalanceFormatted)
                  : 'Unknown balance'}
              </div>
            </div>
          </div>
          {token0Value !== undefined && (
            <div className="text-white font-medium">
              {formatCurrency(token0Value)}
            </div>
          )}
        </div>
        
        {/* Token 1 details */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center">
            <TokenLogo 
              address={token.lpToken1Address || ''} 
              symbol={token1Symbol} 
              size="sm" 
            />
            <div className="ml-1.5">
              <div className="font-medium">{token1Symbol}</div>
              <div className="text-xs text-white/60">
                {token1BalanceFormatted !== undefined 
                  ? formatTokenAmount(token1BalanceFormatted)
                  : 'Unknown balance'}
              </div>
            </div>
          </div>
          {token1Value !== undefined && (
            <div className="text-white font-medium">
              {formatCurrency(token1Value)}
            </div>
          )}
        </div>
        
        {/* Total Position Value */}
        <div className="flex justify-between items-center mt-1 pt-1 border-t border-white/10 text-xs">
          <span className="text-white/60">Total Position Value</span>
          <span className="font-semibold text-white">
            {token.value !== undefined 
              ? formatCurrency(token.value)
              : 'Unknown'}
          </span>
        </div>
        
        {/* Show LP token supply and pool share if available */}
        {token.lpTotalSupply && token.balance && (
          <div className="mt-2 bg-white/5 rounded p-2 text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-white/60">Your LP Tokens:</span>
              <span>{formatTokenAmount(token.balanceFormatted)}</span>
            </div>
            
            {/* Calculate and display the pool share percentage */}
            {(() => {
              try {
                // Convert from string to BigInt for accurate calculation with large numbers
                const userBalance = BigInt(token.balance);
                const totalSupply = BigInt(token.lpTotalSupply);
                
                // Calculate share percentage (with 6 decimals of precision)
                // Multiply by 10000 for 4 decimal places of percentage
                const sharePercentage = Number(userBalance * BigInt(10000) / totalSupply) / 100;
                
                if (!isNaN(sharePercentage)) {
                  return (
                    <div className="flex justify-between">
                      <span className="text-white/60">Pool Share:</span>
                      <span className="font-semibold text-primary">{sharePercentage.toFixed(2)}%</span>
                    </div>
                  );
                }
              } catch (e) {
                // Fall back to not showing pool share if calculation fails
                return null;
              }
              return null;
            })()}
          </div>
        )}
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