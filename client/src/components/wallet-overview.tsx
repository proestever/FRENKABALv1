import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet } from '@shared/schema';
import { ExternalLink, Copy, RotateCw } from 'lucide-react';
import { formatCurrency, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass, truncateAddress } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TokenLogo } from '@/components/token-logo';
import { useState, useEffect } from 'react';
import { getHiddenTokens, isTokenHidden } from '@/lib/api';

interface WalletOverviewProps {
  wallet: Wallet;
  isLoading: boolean;
  onRefresh: () => void;
}

export function WalletOverview({ wallet, isLoading, onRefresh }: WalletOverviewProps) {
  const { toast } = useToast();
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);
  const [totalVisibleValue, setTotalVisibleValue] = useState<number>(0);
  const [visibleTokenCount, setVisibleTokenCount] = useState<number>(0);

  useEffect(() => {
    // Get hidden tokens from localStorage
    setHiddenTokens(getHiddenTokens());
    
    // Listen for token visibility changes
    const handleTokenVisibilityChange = () => {
      setHiddenTokens(getHiddenTokens());
    };
    
    window.addEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (wallet && wallet.tokens) {
      // Calculate total value excluding hidden tokens
      const visibleTokens = wallet.tokens.filter(token => !hiddenTokens.includes(token.address));
      const visibleTotal = visibleTokens.reduce((sum, token) => {
        return sum + (token.value || 0);
      }, 0);
      setTotalVisibleValue(visibleTotal);
      setVisibleTokenCount(visibleTokens.length);
    }
  }, [wallet, hiddenTokens]);

  if (!wallet) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    toast({
      title: "Address copied",
      description: "Wallet address copied to clipboard",
      duration: 3000,
    });
  };

  const plsPriceChangeClass = getAdvancedChangeClass(wallet.plsPriceChange || 0);
  const totalValueChangeClass = 'text-success border border-success/30 bg-success/10 px-1.5 py-0.5 rounded'; // This would be dynamic if we had portfolio change data

  return (
    <section className="mb-8">
      <Card className="p-6 glass-card glass-highlight shadow-lg border-white/15">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Wallet Overview</h2>
            <div className="flex items-center mt-1">
              <span className="text-sm text-muted-foreground mr-2">{wallet.address}</span>
              <Button variant="ghost" size="icon" onClick={handleCopyAddress} className="h-6 w-6 text-foreground hover:text-primary">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href={`https://scan.pulsechain.com/address/${wallet.address}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:text-accent transition-colors text-sm flex items-center"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View on PulseScan
            </a>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={onRefresh}
              disabled={isLoading}
              className="border-muted h-8 w-8 hover:bg-accent hover:text-accent-foreground"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-lg p-4 glass-highlight border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Total Value (Visible)</div>
            <div className="text-2xl font-bold text-white">
              {totalVisibleValue !== undefined ? formatCurrency(totalVisibleValue) : 'N/A'}
            </div>
            <div className="text-sm mt-2 flex items-center">
              <span className="text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-md font-medium">+2.34% (24h)</span>
            </div>
          </div>
          
          <div className="glass-card rounded-lg p-4 glass-highlight border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Token Count (Visible)</div>
            <div className="text-2xl font-bold text-white">
              {visibleTokenCount || 0}
            </div>
            <div className="text-sm mt-2 flex items-center">
              <span className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 rounded-md font-medium">
                {hiddenTokens.length > 0 && `(${hiddenTokens.length} hidden)`}
              </span>
            </div>
          </div>
          
          <div className="glass-card rounded-lg p-4 glass-highlight">
            <div className="flex items-center mb-2">
              <TokenLogo 
                address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" /* PLS native token address */
                symbol="PLS"
                size="sm"
              />
              <div className="text-sm text-muted-foreground ml-2">PLS Balance</div>
            </div>
            <div className="text-2xl font-bold text-white">
              {wallet.plsBalance !== null && wallet.plsBalance !== undefined ? 
                `${formatTokenAmount(wallet.plsBalance)} PLS` : 
                'N/A'
              }
            </div>
            {wallet.plsPriceChange !== null && wallet.plsPriceChange !== undefined && (
              <div className="text-sm mt-2 flex items-center">
                <span className={wallet.plsPriceChange > 0 
                  ? "text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-md font-medium"
                  : "text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded-md font-medium"
                }>
                  {wallet.plsPriceChange > 0 ? '+' : ''}{wallet.plsPriceChange.toFixed(1)}% (24h)
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
