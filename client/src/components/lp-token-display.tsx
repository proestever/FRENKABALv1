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
      <div className="absolute -top-1 -right-1 bg-purple-600/30 text-purple-100 text-[0.65rem] px-1 py-0.5 rounded-md border border-purple-500/60 flex-shrink-0 font-semibold scale-[0.65] origin-top-right">
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
              <div className="absolute -bottom-1 -right-1 z-20 bg-purple-600/30 text-purple-100 text-[0.65rem] px-1 py-0.5 rounded-md border border-purple-500/60 flex-shrink-0 font-semibold scale-[0.65] origin-bottom-right">
                LP
              </div>
            </div>
          ) : (
            renderDualTokensIcon()
          )}
        </div>
        
        {/* Token pair info in list format */}
        <div className="ml-3 flex flex-col justify-center md:block hidden">
          {hasValidPair ? (
            <>
              <div className="hidden md:flex items-center gap-1">
                <span className="text-white font-semibold">{token0Symbol}</span>
                <span className="text-white/70">/</span>
                <span className="text-white font-semibold">{token1Symbol}</span>
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
              <div className="hidden md:flex items-center">
                <div className="text-[10px] text-white/50 rounded-sm">
                  PulseX • {token.balanceFormatted ? formatTokenAmount(token.balanceFormatted) : '0'} tokens
                </div>
              </div>
            </>
          ) : (
            <span className="font-medium md:block hidden">{token.symbol}</span>
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
          {token.value !== undefined && showDetails && (
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
          <div className="flex flex-col md:flex-row md:justify-between gap-2 md:gap-0 items-start md:items-center p-3 bg-black/30 rounded-t-md border border-white/5 border-b-0 w-full max-w-full">
            <div className="flex items-center gap-2">
              <div className="bg-purple-600/30 text-purple-100 text-[0.65rem] px-1.5 py-0.5 rounded-md border border-purple-500/60 flex-shrink-0 font-semibold scale-[0.65] origin-center">
                LP
              </div>
              <div className="flex items-center">
                <span className="text-white font-bold text-sm">{token0Symbol}</span>
                <span className="mx-1 text-white/40">•</span>
                <span className="text-white font-bold text-sm">{token1Symbol}</span>
                <span className="ml-1 text-white/70 text-sm">Pair</span>
              </div>
            </div>
            {poolSharePercentage && (
              <div className="text-xs md:text-sm px-2 py-0.5 bg-white/10 text-white rounded-sm font-medium">
                {poolSharePercentage}% pool share
              </div>
            )}
          </div>
          
          {/* Token details in side-by-side format */}
          <div className="border border-white/5 rounded-b-md w-full max-w-full">
            {/* Tokens in side-by-side horizontal layout */}
            <div className="p-5 w-full max-w-full">
              {/* Center point (LP badge removed) */}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-12 relative w-full max-w-full">
                {/* Token 0 Side */}
                <div className="md:pr-6 md:border-r md:border-white/5 pb-4 md:pb-0 border-b md:border-b-0 border-white/5">
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
                <div className="md:pl-6 pt-4 md:pt-0">
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
                
                {/* Horizontal connecting line - only on desktop */}
                <div className="hidden md:block absolute left-0 right-0 top-1/2 h-[2px] bg-gradient-to-r from-token0-color/30 to-token1-color/30 pointer-events-none"></div>
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