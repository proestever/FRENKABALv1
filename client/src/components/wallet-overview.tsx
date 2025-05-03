import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet } from '@shared/schema';
import { ExternalLink, Copy, RotateCw } from 'lucide-react';
import { formatCurrency, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass, truncateAddress } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TokenLogo } from '@/components/token-logo';

interface WalletOverviewProps {
  wallet: Wallet;
  isLoading: boolean;
  onRefresh: () => void;
}

export function WalletOverview({ wallet, isLoading, onRefresh }: WalletOverviewProps) {
  const { toast } = useToast();

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
      <Card className="p-6 border-border shadow-lg backdrop-blur-sm bg-card/70">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Wallet Overview</h2>
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
          <div className="bg-secondary rounded-lg p-4 border border-border">
            <div className="text-sm text-muted-foreground mb-1">Total Value</div>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {wallet.totalValue !== undefined ? formatCurrency(wallet.totalValue) : 'N/A'}
            </div>
            <div className={`text-sm mt-1 flex items-center ${totalValueChangeClass}`}>
              <span>+2.34% (24h)</span>
            </div>
          </div>
          
          <div className="bg-secondary rounded-lg p-4 border border-border">
            <div className="text-sm text-muted-foreground mb-1">Token Count</div>
            <div className="text-2xl font-bold">{wallet.tokenCount || 0}</div>
            <div className="text-sm mt-1 text-muted-foreground">
              Across {wallet.networkCount || 1} networks
            </div>
          </div>
          
          <div className="bg-secondary rounded-lg p-4 border border-border">
            <div className="flex items-center mb-2">
              <TokenLogo 
                address="0x5616458eb2bAc88dD60a4b08F815F37335215f9B" /* PLS token address */
                symbol="PLS"
                size="sm"
              />
              <div className="text-sm text-muted-foreground ml-2">PLS Balance</div>
            </div>
            <div className="text-2xl font-bold">
              {wallet.plsBalance !== null && wallet.plsBalance !== undefined ? 
                `${formatTokenAmount(wallet.plsBalance)} PLS` : 
                'N/A'
              }
            </div>
            {wallet.plsPriceChange !== null && wallet.plsPriceChange !== undefined && (
              <div className={`text-sm mt-1 flex items-center ${plsPriceChangeClass}`}>
                <span>{wallet.plsPriceChange > 0 ? '+' : ''}{wallet.plsPriceChange.toFixed(1)}% (24h)</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
