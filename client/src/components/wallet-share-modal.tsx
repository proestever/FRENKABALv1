import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { TokenLogo } from '@/components/token-logo';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { getHiddenTokens } from '@/lib/api';


interface WalletShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  walletData: any;
  hexStakesData: any;
}

export function WalletShareModal({
  open,
  onOpenChange,
  walletAddress,
  walletData,
  hexStakesData
}: WalletShareModalProps) {
  const [totalValue, setTotalValue] = useState(0);
  const [sortedTokens, setSortedTokens] = useState<any[]>([]);
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);

  // Load hidden tokens on mount
  useEffect(() => {
    const hidden = getHiddenTokens();
    setHiddenTokens(hidden);
  }, []);

  useEffect(() => {
    if (walletData && walletData.tokens) {
      // Filter out hidden tokens first
      const visibleTokens = walletData.tokens.filter((token: any) => 
        !hiddenTokens.includes(token.address)
      );
      
      // Create a list including PLS balance and HEX stakes if they have value
      let allAssets = [...visibleTokens];
      
      // Add native PLS as a virtual token if it has value
      if (walletData.plsBalance && walletData.plsBalance > 0) {
        // Get WPLS price from tokens
        const wplsToken = walletData.tokens.find((t: any) => 
          t.address.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
        );
        const plsPrice = wplsToken?.price || 0;
        
        const plsToken = {
          address: 'native-pls',
          symbol: 'PLS',
          name: 'Pulse',
          balance: walletData.plsBalance.toString(),
          value: walletData.plsBalance * plsPrice,
          price: plsPrice,
          balanceFormatted: walletData.plsBalance,
          decimals: 18,
          logo: '',
          isLp: false,
          lpToken0Address: '',
          lpToken1Address: '',
          lpToken0Symbol: '',
          lpToken1Symbol: '',
          lpToken0Balance: '',
          lpToken1Balance: '',
          lpToken0BalanceFormatted: 0,
          lpToken1BalanceFormatted: 0,
          lpToken0Value: 0,
          lpToken1Value: 0
        };
        allAssets.push(plsToken);
      }
      
      // Add HEX stakes as a virtual token if it has value
      if (hexStakesData && hexStakesData.totalCombinedValueUsd > 0) {
        const hexStakesToken = {
          address: 'hex-stakes-virtual',
          symbol: 'HEX (Staked)',
          name: 'HEX Stakes',
          balance: hexStakesData.totalCombinedHex,
          value: hexStakesData.totalCombinedValueUsd,
          price: hexStakesData.hexPrice || 0,
          balanceFormatted: parseFloat(hexStakesData.totalCombinedHex),
          decimals: 8,
          logo: '',
          isLp: false,
          lpToken0Address: '',
          lpToken1Address: '',
          lpToken0Symbol: '',
          lpToken1Symbol: '',
          lpToken0Balance: '',
          lpToken1Balance: '',
          lpToken0BalanceFormatted: 0,
          lpToken1BalanceFormatted: 0,
          lpToken0Value: 0,
          lpToken1Value: 0
        };
        allAssets.push(hexStakesToken);
      }
      
      // Sort all assets by value and get top 5
      const sorted = allAssets
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 5);
      
      setSortedTokens(sorted);
      
      // Calculate total portfolio value (visible tokens + PLS + HEX stakes)
      const tokenTotal = visibleTokens.reduce((sum: number, token: any) => sum + (token.value || 0), 0);
      const plsValue = walletData.plsBalance && walletData.plsBalance > 0 ? 
        walletData.plsBalance * (walletData.tokens.find((t: any) => 
          t.address.toLowerCase() === '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
        )?.price || 0) : 0;
      const hexStakesTotal = hexStakesData?.totalCombinedValueUsd || 0;
      setTotalValue(tokenTotal + plsValue + hexStakesTotal);
    }
  }, [walletData, hexStakesData, hiddenTokens]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] bg-gradient-to-b from-black via-gray-950 to-black border-gray-800 text-white p-0 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.15)_0%,transparent_60%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.15)_0%,transparent_60%)] pointer-events-none"></div>
        
        <VisuallyHidden>
          <DialogTitle>Wallet Share</DialogTitle>
        </VisuallyHidden>
        
        <div className="relative z-10 px-4 py-8 md:p-8 md:py-16 overflow-y-auto max-h-[90vh]">

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
              <p className="text-sm md:text-base text-gray-400">Wallet Tracker</p>
            </div>
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
            {sortedTokens.map((token, index) => (
              <div key={token.address} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800">
                <span className="text-lg md:text-2xl font-bold bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text text-transparent w-6 md:w-8 flex-shrink-0">
                  {index + 1}.
                </span>
                <div className="h-12 w-12 md:h-14 md:w-14 flex-shrink-0">
                  {token.address === 'hex-stakes-virtual' ? (
                    <div className="w-full h-full">
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
                  ) : (
                    <div className="w-full h-full">
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
                      {token.symbol || 'Unknown'}
                    </span>
                    <span className="text-base md:text-lg font-bold text-green-400">
                      {formatCurrency(token.value || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs md:text-sm text-gray-400">
                    <span className="truncate mr-2">
                      {token.name || token.symbol || 'Unknown Token'}
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
              Wallet: {walletAddress}
            </p>
            <p className="text-gray-600 text-xs">
              Track your PulseChain portfolio at{' '}
              <span className="text-purple-400">frenkabal.com</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}