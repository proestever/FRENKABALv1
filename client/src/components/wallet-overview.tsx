import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet } from '@shared/schema';
import { ExternalLink, Copy, RotateCw } from 'lucide-react';
import { formatCurrency, formatTokenAmount, getChangeColorClass, truncateAddress } from '@/lib/utils';
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

  const plsPriceChangeClass = getChangeColorClass(wallet.plsPriceChange || 0);
  const totalValueChangeClass = 'text-success'; // This would be dynamic if we had portfolio change data

  return (
    <section className="mb-8">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold">Wallet Overview</h2>
            <div className="flex items-center mt-1">
              <span className="text-sm text-secondary-500 mr-2">{wallet.address}</span>
              <Button variant="ghost" size="icon" onClick={handleCopyAddress} className="h-6 w-6">
                <Copy className="h-4 w-4 text-primary-500" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href={`https://scan.pulsechain.com/address/${wallet.address}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-500 hover:text-primary-600 text-sm flex items-center"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View on PulseScan
            </a>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={onRefresh}
              disabled={isLoading}
              className="text-secondary-500 hover:text-secondary-700 bg-secondary-50 h-8 w-8"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-secondary-50 rounded-lg p-4">
            <div className="text-sm text-secondary-500 mb-1">Total Value</div>
            <div className="text-2xl font-bold">
              {wallet.totalValue !== undefined ? formatCurrency(wallet.totalValue) : 'N/A'}
            </div>
            <div className={`text-sm mt-1 flex items-center ${totalValueChangeClass}`}>
              <span>+2.34% (24h)</span>
            </div>
          </div>
          
          <div className="bg-secondary-50 rounded-lg p-4">
            <div className="text-sm text-secondary-500 mb-1">Token Count</div>
            <div className="text-2xl font-bold">{wallet.tokenCount || 0}</div>
            <div className="text-sm mt-1 text-secondary-500">
              Across {wallet.networkCount || 1} networks
            </div>
          </div>
          
          <div className="bg-secondary-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <TokenLogo 
                address="0x5616458eb2bAc88dD60a4b08F815F37335215f9B" /* PLS token address */
                symbol="PLS"
                size="sm"
              />
              <div className="text-sm text-secondary-500 ml-2">PLS Balance</div>
            </div>
            <div className="text-2xl font-bold">
              {wallet.plsBalance !== null ? 
                `${formatTokenAmount(wallet.plsBalance)} PLS` : 
                'N/A'
              }
            </div>
            {wallet.plsPriceChange !== null && (
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
