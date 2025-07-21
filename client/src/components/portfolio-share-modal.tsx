import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TokenLogo } from './token-logo';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Token } from '@shared/schema';
import { getHiddenTokens } from '@/lib/api';

interface PortfolioShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioName: string;
  walletData: any; // Combined wallet data
  hexStakesData: any; // Combined HEX stakes data
}

export function PortfolioShareModal({ 
  open, 
  onOpenChange, 
  portfolioName,
  walletData,
  hexStakesData
}: PortfolioShareModalProps) {
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);

  // Load hidden tokens on mount
  useEffect(() => {
    const hidden = getHiddenTokens();
    setHiddenTokens(hidden);
  }, []);

  // Calculate portfolio data
  const portfolioData = useMemo(() => {
    if (!walletData) return { totalValue: 0, topTokens: [] };
    
    // Get all visible tokens (exclude hidden tokens)
    const visibleTokens = (walletData.tokens || []).filter((token: Token) => 
      !hiddenTokens.includes(token.address)
    );
    
    // Add HEX stakes as a virtual token if it exists and has value
    const allTokens = [...visibleTokens];
    if (hexStakesData && hexStakesData.totalCombinedValueUsd > 0) {
      allTokens.push({
        address: 'hex-stakes-virtual',
        name: 'HEX Stakes',
        symbol: 'HEX Stakes',
        value: hexStakesData.totalCombinedValueUsd,
        balanceFormatted: hexStakesData.totalCombinedHex,
        price: hexStakesData.hexPrice,
        isLp: false
      });
    }
    
    // Add native PLS if exists
    if (walletData.plsBalance && walletData.plsBalance > 0) {
      // Calculate PLS value using WPLS price if available
      const wplsToken = visibleTokens.find((t: Token) => 
        t.symbol?.toLowerCase() === 'wpls' && t.price
      );
      const plsPrice = wplsToken?.price || 0;
      const plsValue = walletData.plsBalance * plsPrice;
      
      if (plsValue > 0) {
        allTokens.push({
          address: 'native-pls',
          name: 'PulseChain',
          symbol: 'PLS',
          value: plsValue,
          balanceFormatted: walletData.plsBalance,
          price: plsPrice,
          isLp: false,
          lpToken0Symbol: undefined,
          lpToken1Symbol: undefined,
          lpToken0Address: undefined,
          lpToken1Address: undefined
        });
      }
    }
    
    // Sort tokens by value and get top 5
    const sortedTokens = allTokens
      .filter(token => token.value && token.value > 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 5);
    
    // Calculate total portfolio value from visible tokens only
    const tokenValue = visibleTokens.reduce((sum: number, token: Token) => 
      sum + (token.value || 0), 0
    );
    const hexValue = hexStakesData?.totalCombinedValueUsd || 0;
    const plsValue = walletData.plsBalance && walletData.plsBalance > 0 ? 
      walletData.plsBalance * (sortedTokens.find(t => t.symbol === 'WPLS')?.price || 0) : 0;
    
    const totalValue = tokenValue + hexValue + plsValue;
    
    return {
      totalValue,
      topTokens: sortedTokens
    };
  }, [walletData, hexStakesData, hiddenTokens]);

  const { totalValue, topTokens } = portfolioData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw] bg-gradient-to-b from-black via-gray-950 to-black border-gray-800 text-white p-0 overflow-hidden [&>button:first-child]:hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.15)_0%,transparent_60%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.15)_0%,transparent_60%)] pointer-events-none"></div>
        
        <VisuallyHidden>
          <DialogTitle>Portfolio Share</DialogTitle>
        </VisuallyHidden>
        
        <div className="relative z-10 px-4 py-8 md:p-8 md:py-16">


          {/* Frenkabal Branding */}
          <div className="flex items-center justify-center mb-8 md:mb-12">
            <img 
              src="/assets/100xfrenlogo.png" 
              alt="Frenkabal" 
              className="h-16 w-16 md:h-20 md:w-20 mr-3 md:mr-4 animate-pulse"
            />
            <div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                FRENKABAL
              </h1>
              <p className="text-sm md:text-base text-gray-400">Portfolio Tracker</p>
            </div>
          </div>

          {/* Portfolio Name */}
          <div className="text-center mb-4">
            <h2 className="text-xl md:text-3xl font-bold text-white">{portfolioName}</h2>
            <p className="text-sm md:text-base text-gray-400 mt-1">Portfolio Bundle</p>
          </div>

          {/* Portfolio Total */}
          <div className="text-center mb-6 md:mb-8">
            <p className="text-gray-400 text-xs md:text-sm mb-2">Total Portfolio Value</p>
            <p className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              {formatCurrency(totalValue)}
            </p>
          </div>

          {/* Token List */}
          <div className="space-y-3 md:space-y-4 mb-8">
            {topTokens.map((token, index) => (
              <div key={token.address} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800">
                <span className="text-lg md:text-2xl font-bold bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text text-transparent w-6 md:w-8 flex-shrink-0">
                  {index + 1}.
                </span>
                <div className="h-12 w-12 md:h-14 md:w-14 flex-shrink-0 flex items-center justify-center">
                  {token.address === 'hex-stakes-virtual' ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <TokenLogo 
                        address="0x2b591e99afe9f32eaa6214f7b7629768c40eeb39" 
                        symbol="HEX" 
                        size="lg"
                      />
                    </div>
                  ) : token.address === 'native-pls' ? (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <span className="text-white font-bold text-base md:text-lg">PLS</span>
                    </div>
                  ) : token.isLp && token.lpToken0Address && token.lpToken1Address ? (
                    <div className="relative flex items-center justify-center w-full h-full">
                      <div className="flex items-center">
                        {/* Token logos side by side with slight overlap */}
                        <div className="rounded-full border-2 border-black/80 z-10 overflow-hidden">
                          <TokenLogo 
                            address={token.lpToken0Address} 
                            symbol={token.lpToken0Symbol || '?'} 
                            size="sm" 
                          />
                        </div>
                        <div className="-ml-1.5 rounded-full border-2 border-black/80 overflow-hidden">
                          <TokenLogo 
                            address={token.lpToken1Address} 
                            symbol={token.lpToken1Symbol || '?'} 
                            size="sm" 
                          />
                        </div>
                      </div>
                      {/* LP Badge */}
                      <div className="absolute -bottom-0.5 -right-0.5 z-20 bg-purple-600/90 text-purple-100 text-[0.5rem] px-1 py-0.5 rounded-md border border-purple-400/80 flex-shrink-0 font-bold">
                        LP
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <TokenLogo 
                        address={token.address} 
                        symbol={token.symbol} 
                        size="lg"
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base md:text-lg font-semibold text-white uppercase tracking-wide">
                      {token.isLp && token.lpToken0Symbol && token.lpToken1Symbol 
                        ? `${token.lpToken0Symbol}/${token.lpToken1Symbol}`
                        : token.symbol || 'Unknown'}
                    </span>
                    <span className="text-base md:text-lg font-bold text-green-400">
                      {formatCurrency(token.value || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs md:text-sm text-gray-400">
                    <span className="truncate mr-2">
                      {token.isLp && token.lpToken0Symbol && token.lpToken1Symbol 
                        ? `PulseX LP: ${token.lpToken0Symbol}/${token.lpToken1Symbol}`
                        : token.name || token.symbol || 'Unknown Token'}
                    </span>
                    <span className="flex-shrink-0">
                      {formatTokenAmount(token.balanceFormatted || 0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-gray-500 text-xs md:text-sm mb-2">
              Portfolio: {portfolioName}
            </p>
            <p className="text-gray-600 text-xs">
              Track your PulseChain portfolios at{' '}
              <span className="text-purple-400">frenkabal.com</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}