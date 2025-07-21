import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { useClientSideWallet } from '@/hooks/use-client-side-wallet';
import { useHexStakes } from '@/hooks/use-hex-stakes';
import { TokenLogo } from '@/components/token-logo';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { Token } from '@shared/schema';

export default function WalletShare() {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const { walletData, isLoading } = useClientSideWallet(walletAddress || '');
  const hexStakesData = useHexStakes(walletAddress || '');
  const [totalValue, setTotalValue] = useState(0);
  const [sortedTokens, setSortedTokens] = useState<Token[]>([]);

  useEffect(() => {
    if (walletData && walletData.tokens) {
      // Sort tokens by value and get top 10
      const sorted = [...walletData.tokens]
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 10);
      
      setSortedTokens(sorted);
      
      // Calculate total portfolio value
      const tokenTotal = walletData.tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      const hexStakesTotal = hexStakesData?.totalCombinedValueUsd || 0;
      setTotalValue(tokenTotal + hexStakesTotal);
    }
  }, [walletData, hexStakesData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading wallet data...</div>
      </div>
    );
  }

  if (!walletData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Wallet not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Background decoration */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.15)_0%,transparent_60%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.15)_0%,transparent_60%)] pointer-events-none"></div>
      
      <div className="relative z-10 p-8">
        <div className="max-w-2xl mx-auto">
          {/* Frenkabal Branding */}
          <div className="flex items-center justify-center mb-12">
            <img 
              src="/assets/100xfrenlogo.png" 
              alt="Frenkabal" 
              className="h-20 w-20 mr-4 animate-pulse"
            />
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Frenkabal
              </h1>
              <p className="text-gray-400 text-sm mt-1">PulseChain Wallet Tracker</p>
            </div>
          </div>

          {/* Portfolio Total */}
          <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-xl p-8 mb-8 border border-purple-500/20 backdrop-blur-sm">
            <h2 className="text-2xl text-gray-300 mb-3 font-medium">Portfolio Total Value</h2>
            <div className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              {formatCurrency(totalValue)}
            </div>
            <div className="mt-3 text-sm text-gray-400">
              {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>

          {/* Top 10 Tokens List */}
          <div className="bg-gray-900/50 rounded-xl p-8 border border-gray-800/50 backdrop-blur-sm">
            <h3 className="text-2xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Top 10 Holdings
            </h3>
            <div className="space-y-4">
              {sortedTokens.map((token, index) => (
                <div key={token.address} className="flex items-center justify-between py-3 border-b border-gray-800/50 last:border-0">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text text-transparent w-10">
                      {index + 1}.
                    </span>
                    <TokenLogo 
                      address={token.address} 
                      symbol={token.symbol} 
                      size="md"
                    />
                    <div>
                      <span className="text-xl font-semibold text-white">
                        {token.symbol || 'Unknown'}
                      </span>
                      {token.name && (
                        <p className="text-sm text-gray-400">{token.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-400">
                      {formatCurrency(token.value || 0)}
                    </div>
                    {token.balance && (
                      <p className="text-sm text-gray-400">
                        {formatTokenAmount(parseFloat(token.balance))} {token.symbol}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm mb-2">
              Wallet: {walletAddress}
            </p>
            <p className="text-gray-600 text-xs">
              Track your PulseChain portfolio at{' '}
              <span className="text-purple-400">frenkabal.app</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}