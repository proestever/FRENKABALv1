import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClientWalletData } from '@/hooks/use-client-wallet-data';
import { useState } from 'react';
import { Loader2, Zap, ExternalLink } from 'lucide-react';
import { formatCurrency, formatTokenAmount, truncateAddress } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';

interface ClientWalletDemoProps {
  walletAddress: string;
}

export function ClientWalletDemo({ walletAddress }: ClientWalletDemoProps) {
  const [useClientMode, setUseClientMode] = useState(false);
  const { data: walletData, isLoading, error } = useClientWalletData(useClientMode ? walletAddress : '');

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-600" />
          Client-Side API Demo
          <Badge variant="outline" className="bg-green-100 text-green-700">
            Zero Server Load
          </Badge>
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          This demo fetches data directly from PulseChain Scan and DexScreener APIs in your browser, 
          completely bypassing the server to eliminate API costs and load.
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={() => setUseClientMode(!useClientMode)}
            variant={useClientMode ? "destructive" : "default"}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {useClientMode ? 'Stop Client Mode' : 'Enable Client Mode'}
          </Button>
          
          {useClientMode && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Client Mode Active
            </Badge>
          )}
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
            Error: {error.message}
          </div>
        )}

        {walletData && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-lg font-semibold text-green-600">
                  {formatCurrency(walletData.totalValue)}
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground">Token Count</div>
                <div className="text-lg font-semibold">{walletData.tokenCount}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground">PLS Balance</div>
                <div className="text-lg font-semibold">
                  {formatTokenAmount(walletData.plsBalance || 0)} PLS
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Top Tokens:</div>
              {walletData.tokens
                .filter(token => (token.value || 0) > 0)
                .sort((a, b) => (b.value || 0) - (a.value || 0))
                .slice(0, 5)
                .map(token => (
                  <div key={token.address} className="flex items-center justify-between bg-white p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <TokenLogo 
                        address={token.address}
                        symbol={token.symbol} 
                        fallbackLogo={token.logo} 
                        size="sm" 
                      />
                      <div>
                        <div className="font-medium">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTokenAmount(token.balanceFormatted)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {formatCurrency(token.value || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(token.price || 0)} each
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="text-xs text-muted-foreground bg-white p-2 rounded border">
              <div className="flex items-center gap-1 mb-1">
                <ExternalLink className="h-3 w-3" />
                Data Sources:
              </div>
              <div>• Wallet balances: PulseChain Scan API</div>
              <div>• Token prices: DexScreener API</div>
              <div>• All requests made directly from your browser</div>
            </div>
          </div>
        )}

        {!useClientMode && (
          <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded">
            Click "Enable Client Mode" to see wallet data fetched directly from blockchain APIs 
            without using your server resources.
          </div>
        )}
      </CardContent>
    </Card>
  );
}