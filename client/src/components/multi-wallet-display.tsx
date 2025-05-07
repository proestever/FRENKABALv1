import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMultipleWallets } from '@/hooks/use-multiple-wallets';
import { Wallet } from '@shared/schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { truncateAddress, formatCurrency, formatNumber } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { TokenList } from '@/components/token-list';
import { WalletOverview } from '@/components/wallet-overview';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

// Import ProcessedToken interface for type compatibility
import { ProcessedToken } from '@/lib/api';

interface MultiWalletDisplayProps {
  addresses: string[];
  onRemoveAddress: (address: string) => void;
}

export function MultiWalletDisplay({ addresses, onRemoveAddress }: MultiWalletDisplayProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  
  const { 
    walletsData, 
    isLoading,
    isError,
    error,
    isFetching,
    progress,
    refetch,
    totalValue,
    totalTokens
  } = useMultipleWallets(addresses);

  // If no addresses, show empty state
  if (addresses.length === 0) {
    return (
      <Card className="shadow-lg glass-card border border-white/20 mb-6">
        <CardHeader>
          <CardTitle className="text-center">No Wallets Selected</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            Select multiple wallet addresses to compare them.
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Show loading state
  if (isLoading) {
    return (
      <Card className="shadow-lg glass-card border border-white/20 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Loading Multiple Wallets 
            <Badge variant="outline" className="ml-2">
              {addresses.length} wallets
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex justify-between mb-2 text-sm">
              <span>{progress.message || 'Loading wallet data...'}</span>
              <span>{progress.currentBatch} of {progress.totalBatches}</span>
            </div>
            <Progress 
              value={(progress.currentBatch / progress.totalBatches) * 100} 
              className="h-2"
            />
          </div>
          
          <div className="space-y-4">
            {addresses.map((address, index) => (
              <div key={address} className="flex justify-between items-center">
                <div className="text-sm">{truncateAddress(address)}</div>
                <Skeleton className="h-4 w-24 bg-white/10" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Show error state
  if (isError) {
    return (
      <Card className="shadow-lg glass-card border border-red-800/30 bg-red-950/10 mb-6">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Error Loading Wallets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-300 mb-4">
            {error instanceof Error ? error.message : 'Failed to load wallet data'}
          </div>
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // Count how many wallets loaded successfully
  const loadedWallets = walletsData ? Object.keys(walletsData).length : 0;
  
  // No data found for any wallets
  if (loadedWallets === 0) {
    return (
      <Card className="shadow-lg glass-card border border-white/20 mb-6">
        <CardHeader>
          <CardTitle className="text-center">No Data Found</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            No data could be retrieved for the selected wallet addresses.
          </div>
          <div className="flex justify-center mt-4">
            <Button onClick={() => refetch()} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Filter out wallets that failed to load
  const validWallets = walletsData 
    ? Object.entries(walletsData)
        .filter(([_, data]) => !(data as any).error)
        .map(([address, data]) => ({ address, data: data as Wallet }))
    : [];
  
  // Calculate the percentage of total value for each wallet
  const getWalletPercentage = (walletValue: number) => {
    if (totalValue === 0) return 0;
    return (walletValue / totalValue) * 100;
  };
  
  return (
    <Card className="shadow-lg glass-card border border-white/20 mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            Multi-Wallet Analysis
            <Badge variant="outline" className="ml-2">
              {validWallets.length} wallets
            </Badge>
          </CardTitle>
          
          <Button 
            onClick={() => refetch()} 
            variant="ghost" 
            size="icon"
            className={`rounded-full ${isFetching ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card border border-white/10 rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Total Value</div>
              <div className="text-xl font-bold mt-1">{formatCurrency(totalValue)}</div>
            </div>
            
            <div className="glass-card border border-white/10 rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Total Tokens</div>
              <div className="text-xl font-bold mt-1">{formatNumber(totalTokens)}</div>
            </div>
            
            <div className="glass-card border border-white/10 rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Wallets</div>
              <div className="text-xl font-bold mt-1">{validWallets.length}</div>
            </div>
            
            <div className="glass-card border border-white/10 rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Average Value</div>
              <div className="text-xl font-bold mt-1">
                {formatCurrency(validWallets.length > 0 ? totalValue / validWallets.length : 0)}
              </div>
            </div>
          </div>
          
          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="glass-card mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tokens">All Tokens</TabsTrigger>
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              {validWallets.map(({ address, data }) => (
                <div key={address} className="relative glass-card border border-white/10 rounded-lg p-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 rounded-full opacity-70 hover:opacity-100"
                    onClick={() => onRemoveAddress(address)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{truncateAddress(address)}</div>
                        <Badge variant="outline" className="text-xs">
                          {formatNumber(data.tokenCount || 0)} tokens
                        </Badge>
                      </div>
                      <div className="text-lg font-bold mt-1">
                        {formatCurrency(data.totalValue || 0)}
                      </div>
                    </div>
                    
                    <div className="w-full md:w-1/2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{formatNumber(getWalletPercentage(data.totalValue || 0), 1)}% of total</span>
                        <span>{formatCurrency(data.totalValue || 0)}</span>
                      </div>
                      <Progress value={getWalletPercentage(data.totalValue || 0)} className="h-2" />
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="tokens">
              {/* Combined token list from all wallets */}
              {validWallets.length > 0 && (
                <TokenList
                  tokens={validWallets.flatMap(({ data }) => data.tokens)}
                  isLoading={false}
                  hasError={false}
                  walletAddress=""
                />
              )}
            </TabsContent>
            
            <TabsContent value="comparison">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {validWallets.map(({ address, data }) => (
                  <Card key={address} className="glass-card border border-white/10">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between">
                        <CardTitle className="text-base">{truncateAddress(address)}</CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full opacity-70 hover:opacity-100"
                          onClick={() => onRemoveAddress(address)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <WalletOverview
                        wallet={data}
                        isLoading={false}
                        onRefresh={() => {}}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}