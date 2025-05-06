import React from 'react';
import { Token } from '@shared/schema';
import { TokenLogo } from './token-logo';
import { ExternalLink } from 'lucide-react';

interface LpTokenDisplayProps {
  token: Token;
  size?: 'sm' | 'md' | 'lg';
}

export function LpTokenDisplay({ token, size = 'md' }: LpTokenDisplayProps) {
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
  
  // Get PulseX LP pool URL if possible
  const getPulseXPoolUrl = () => {
    return `https://scan.pulsechain.com/token/${token.address}`;
  };

  return (
    <div className="flex items-center">
      <div className="relative">
        <TokenLogo 
          address={token.address} 
          symbol={token.symbol} 
          size={logoSize} 
        />
        
        {/* PulseX indicator badge */}
        {token.isLp && (
          <div className="absolute -top-1 -right-1 bg-gradient-to-br from-primary to-accent text-white text-[8px] px-1 rounded-sm font-bold">
            PLP
          </div>
        )}
      </div>
      
      {/* LP Token details */}
      <div className={`flex flex-col ml-2 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        <div className="font-medium">
          {hasValidPair ? (
            <span>
              {token0Symbol}/{token1Symbol} LP
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
        </div>
      </div>
    </div>
  );
}