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
import { X } from 'lucide-react';

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
      
      // Sort all assets by value and get top 10
      const sorted = allAssets
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 10);
      
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
      <DialogContent className="max-w-2xl bg-gradient-to-b from-black via-gray-950 to-black border-gray-800 text-white p-0 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.15)_0%,transparent_60%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.15)_0%,transparent_60%)] pointer-events-none"></div>
        
        <VisuallyHidden>
          <DialogTitle>Wallet Share</DialogTitle>
        </VisuallyHidden>
        
        <div className="relative z-10 p-8">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-800/50 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>

          {/* Frenkabal Branding */}
          <div className="flex items-center justify-center mb-12">
            <img 
              src="/assets/100xfrenlogo.png" 
              alt="Frenkabal" 
              className="h-20 w-20 mr-4 animate-pulse"
            />
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                FRENKABAL
              </h1>
              <p className="text-gray-400">Wallet Tracker</p>
            </div>
          </div>

          {/* Portfolio Total */}
          <div className="text-center mb-8">
            <p className="text-gray-400 text-sm mb-2">Total Portfolio Value</p>
            <p className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              {formatCurrency(totalValue)}
            </p>
          </div>

          {/* Token List */}
          <div className="space-y-4 mb-8">
            {sortedTokens.map((token, index) => (
              <div key={token.address} className="flex items-center justify-between p-4 rounded-lg bg-gray-900/50 backdrop-blur-sm border border-gray-800">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text text-transparent w-10">
                    {index + 1}.
                  </span>
                  {token.address === 'hex-stakes-virtual' ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">HEX</span>
                    </div>
                  ) : token.address === 'native-pls' ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">PLS</span>
                    </div>
                  ) : (
                    <TokenLogo 
                      address={token.address} 
                      symbol={token.symbol} 
                      size="md"
                    />
                  )}
                  <div>
                    <span className="text-xl font-semibold text-white">
                      {token.symbol || 'Unknown'}
                    </span>
                    <span className="text-gray-400 ml-2 text-sm">
                      {token.name || ''}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-white">
                    {formatCurrency(token.value || 0)}
                  </p>
                  <p className="text-sm text-gray-400">
                    {formatTokenAmount(token.balanceFormatted || 0)} {token.symbol}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">
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