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
        {/* Enhanced dual token logos display */}
        <div className="relative">
          {hasValidPair && token.lpToken0Address && token.lpToken1Address ? (
            <div className="relative">
              <div className="flex">
                {/* Token logos side by side with slight overlap */}
                <div className="rounded-full border-2 border-background z-10">
                  <TokenLogo 
                    address={token.lpToken0Address} 
                    symbol={token0Symbol} 
                    size={size === 'sm' ? 'xs' : 'sm'} 
                  />
                </div>
                <div className="-ml-2 rounded-full border-2 border-background">
                  <TokenLogo 
                    address={token.lpToken1Address} 
                    symbol={token1Symbol} 
                    size={size === 'sm' ? 'xs' : 'sm'} 
                  />
                </div>
              </div>
              
              {/* LP Badge */}
              <div className="absolute -bottom-1 -right-1 z-20 bg-primary text-[9px] text-background font-bold rounded-full w-5 h-5 flex items-center justify-center border border-background">
                LP
              </div>
            </div>
          ) : (
            renderDualTokensIcon()
          )}
        </div>
        
        {/* Token pair info in list format */}
        <div className="ml-3 flex flex-col justify-center">
          {hasValidPair ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-token0-color font-semibold">{token0Symbol}</span>
                <span className="text-white/70">/</span>
                <span className="text-token1-color font-semibold">{token1Symbol}</span>
                <a 
                  href={getPulseXPoolUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-white/60 hover:text-white/90 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="flex items-center">
                <div className="text-[10px] text-white/50 rounded-sm">
                  PulseX LP • {token.balanceFormatted ? formatTokenAmount(token.balanceFormatted) : '0'} tokens
                </div>
              </div>
            </>
          ) : (
            <span className="font-medium">{token.symbol}</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center">
        {/* Value display with detailed button style */}
        <div className="flex items-center gap-3">
          {/* Show details badge */}
          {showDetails && hasDetailedData && (
            <button 
              onClick={toggleExpand}
              className="text-xs text-white/70 hover:text-white/90 transition-colors flex items-center gap-0.5 bg-black/30 px-2 py-0.5 rounded"
              title={isExpanded ? "Hide details" : "Show details"}
            >
              {isExpanded ? "Hide details" : "View details"}
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {token.value !== undefined && (
            <div className="bg-gradient-to-r from-token0-color/20 to-token1-color/20 text-white px-3 py-1.5 rounded font-bold text-base md:text-lg">
              {formatCurrency(token.value)}
            </div>
          )}
        </div>
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
      <div className="mt-2 pl-2 border-l border-white/40 text-xs w-full max-w-full">
        {/* LP position divider */}
        <div className="my-1 border-t border-white/5"></div>
        
        {/* Detailed list layout for LP tokens */}
        <div className="mt-1 w-full max-w-full">
          {/* LP position header with pair indication */}
          <div className="flex justify-between items-center p-3 bg-black/30 rounded-t-md border border-white/5 border-b-0 w-full max-w-full">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">LP</span>
              </div>
              <div className="flex items-center">
                <span className="text-white font-bold text-sm">{token0Symbol}</span>
                <span className="mx-1 text-white/40">•</span>
                <span className="text-white font-bold text-sm">{token1Symbol}</span>
                <span className="ml-1 text-white/70 text-sm">Pair</span>
              </div>
            </div>
            {poolSharePercentage && (
              <div className="text-sm px-2 py-0.5 bg-white/10 text-white rounded-sm font-medium">
                {poolSharePercentage}% pool share
              </div>
            )}
          </div>
          
          {/* Token details in side-by-side format */}
          <div className="border border-white/5 rounded-b-md w-full max-w-full">
            {/* Tokens in side-by-side horizontal layout */}
            <div className="p-5 w-full max-w-full">
              {/* LP symbol in center */}
              <div className="absolute left-1/2 transform -translate-x-1/2 top-[5.5rem] flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-token0-color/10 to-token1-color/10 border border-white/10 flex items-center justify-center z-10 shadow-lg">
                  <span className="text-white text-sm font-bold">LP</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-12 relative w-full max-w-full">
                {/* Token 0 Side */}
                <div className="pr-6 border-r border-white/5">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 mr-4 p-1.5 rounded-full bg-token0-color/10 border border-token0-color/15">
                        <TokenLogo address={token.lpToken0Address || ''} symbol={token0Symbol} size="lg" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-lg">{token0Symbol}</span>
                        <span className="text-white/50 text-xs truncate max-w-[130px]">{token.lpToken0Name}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end ml-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white/60 font-medium text-sm">Balance:</span>
                        <span className="text-white font-bold text-base">{formatTokenAmount(token0BalanceFormatted || 0)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-white/60 font-medium text-sm">Value:</span>
                        {token0Value !== undefined && (
                          <span className="text-white font-bold text-base">{formatCurrency(token0Value)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Token 1 Side */}
                <div className="pl-6">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 mr-4 p-1.5 rounded-full bg-token1-color/10 border border-token1-color/15">
                        <TokenLogo address={token.lpToken1Address || ''} symbol={token1Symbol} size="lg" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-lg">{token1Symbol}</span>
                        <span className="text-white/50 text-xs truncate max-w-[130px]">{token.lpToken1Name}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end ml-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white/60 font-medium text-sm">Balance:</span>
                        <span className="text-white font-bold text-base">{formatTokenAmount(token1BalanceFormatted || 0)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-white/60 font-medium text-sm">Value:</span>
                        {token1Value !== undefined && (
                          <span className="text-white font-bold text-base">{formatCurrency(token1Value)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Horizontal connecting line */}
                <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-gradient-to-r from-token0-color/30 to-token1-color/30 pointer-events-none"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full max-w-full flex-grow">
      {renderSimpleDisplay()}
      {renderDetailedDisplay()}
    </div>
  );
}