import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, Clock, Server, CheckCircle, XCircle, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface TopWallet {
  walletAddress: string;
  callCount: number;
}

interface WalletApiUsage {
  walletAddress: string;
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  firstCall: string | null;
  lastCall: string | null;
  endpointBreakdown: Array<{
    endpoint: string;
    callCount: number;
    cacheHits: number;
    cacheMisses: number;
  }>;
  dailyUsage: Array<{
    date: string;
    callCount: number;
    cacheHits: number;
    cacheMisses: number;
  }>;
  estimatedCUs: number;
  dailyCUsAverage: number;
}

export function ApiUsageViewer() {
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WalletApiUsage | null>(null);
  const [topWallets, setTopWallets] = useState<TopWallet[]>([]);
  const [loadingTopWallets, setLoadingTopWallets] = useState<boolean>(false);
  
  // Fetch top wallets on component mount
  useEffect(() => {
    const fetchTopWallets = async () => {
      setLoadingTopWallets(true);
      try {
        const response = await fetch('/api/stats/top-wallets');
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        setTopWallets(data);
      } catch (err) {
        console.error('Error fetching top wallets:', err);
      } finally {
        setLoadingTopWallets(false);
      }
    };
    
    fetchTopWallets();
  }, []);
  
  const handleFetchStats = async () => {
    if (!walletAddress) {
      setError('Please enter a wallet address');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/stats/wallet/${walletAddress}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Format date string or return 'N/A' if null
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
        API Usage Statistics
      </h2>
      
      <Card className="p-4 space-y-4 shadow-md backdrop-blur-sm bg-card/80 border-muted">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Label htmlFor="wallet-address">Wallet Address</Label>
            <Input 
              id="wallet-address"
              placeholder="0x..." 
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="glass-card border-muted-foreground/20"
            />
          </div>
          <div className="flex items-end">
            <Button 
              onClick={handleFetchStats} 
              disabled={loading || !walletAddress}
              className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : "Check Usage"}
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-500 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {data && !error && (
          <div className="space-y-6 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Calls Card */}
              <Card className="p-4 bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center">
                  <Server className="h-10 w-10 text-blue-500 mr-3" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total API Calls</p>
                    <p className="text-2xl font-bold">{data.totalCalls.toLocaleString()}</p>
                  </div>
                </div>
              </Card>
              
              {/* Estimated CUs Card */}
              <Card className="p-4 bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center">
                  <Server className="h-10 w-10 text-purple-500 mr-3" />
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated CUs</p>
                    <p className="text-2xl font-bold">{data.estimatedCUs.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">~{data.dailyCUsAverage} CUs/day avg</p>
                  </div>
                </div>
              </Card>
              
              {/* Cache Hit Rate Card */}
              <Card className="p-4 bg-green-500/10 border border-green-500/20">
                <div className="flex items-center">
                  <CheckCircle className="h-10 w-10 text-green-500 mr-3" />
                  <div>
                    <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
                    <p className="text-2xl font-bold">{data.cacheHitRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{data.cacheHits} hits / {data.cacheMisses} misses</p>
                  </div>
                </div>
              </Card>
              
              {/* Timestamp Card */}
              <Card className="p-4 bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center">
                  <Clock className="h-10 w-10 text-amber-500 mr-3" />
                  <div>
                    <p className="text-sm text-muted-foreground">Activity Period</p>
                    <p className="text-xs">First: {formatDate(data.firstCall)}</p>
                    <p className="text-xs">Last: {formatDate(data.lastCall)}</p>
                  </div>
                </div>
              </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Endpoint Breakdown */}
              <Card className="p-4 bg-card shadow-md overflow-hidden border-muted">
                <h3 className="text-lg font-semibold mb-2">Endpoint Usage</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2">Endpoint</th>
                        <th className="text-right py-2">Calls</th>
                        <th className="text-right py-2">Hit Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.endpointBreakdown.map((endpoint, i) => {
                        const hitRate = endpoint.callCount ? 
                          (endpoint.cacheHits / endpoint.callCount) * 100 : 0;
                          
                        return (
                          <tr key={i} className="border-b border-muted/40 hover:bg-muted/20">
                            <td className="py-2">{endpoint.endpoint}</td>
                            <td className="text-right py-2">{endpoint.callCount}</td>
                            <td className="text-right py-2">
                              <span className={hitRate > 50 ? 'text-green-500' : 'text-amber-500'}>
                                {hitRate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              
              {/* Daily Usage */}
              <Card className="p-4 bg-card shadow-md overflow-hidden border-muted">
                <h3 className="text-lg font-semibold mb-2">Daily Usage (Last 30 Days)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-2">Date</th>
                        <th className="text-right py-2">Calls</th>
                        <th className="text-right py-2">Cache Hits</th>
                        <th className="text-right py-2">Cache Misses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyUsage.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-muted-foreground">
                            No daily usage data available
                          </td>
                        </tr>
                      ) : (
                        data.dailyUsage.map((day, i) => (
                          <tr key={i} className="border-b border-muted/40 hover:bg-muted/20">
                            <td className="py-2">{format(new Date(day.date), 'MMM d, yyyy')}</td>
                            <td className="text-right py-2">{day.callCount}</td>
                            <td className="text-right py-2 text-green-500">{day.cacheHits}</td>
                            <td className="text-right py-2 text-amber-500">{day.cacheMisses}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4">
              <h3 className="text-lg font-semibold mb-2">Data Fetching Information</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All data is now fetched directly from your browser to blockchain APIs</li>
                <li>Use bookmarks to quickly access frequently viewed wallets</li>
                <li>Create portfolios to track multiple wallets in one view</li>
                <li>Real-time data provides the most current blockchain information</li>
                <li>No server-side processing means faster, more direct access to data</li>
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* Top Wallets Section */}
      <Card className="p-4 space-y-4 shadow-md backdrop-blur-sm bg-card/80 border-muted mt-6">
        <div className="flex items-center mb-4">
          <Users className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-xl font-semibold">Top Wallet Activity</h2>
        </div>
        
        {loadingTopWallets ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : topWallets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No wallet activity data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted">
                  <th className="text-left py-2">Wallet Address</th>
                  <th className="text-right py-2">API Calls</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {topWallets.map((wallet, i) => (
                  <tr key={i} className="border-b border-muted/40 hover:bg-muted/20">
                    <td className="py-2 font-mono">
                      {wallet.walletAddress.substring(0, 6)}...{wallet.walletAddress.substring(wallet.walletAddress.length - 4)}
                    </td>
                    <td className="text-right py-2">{wallet.callCount}</td>
                    <td className="text-right py-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setWalletAddress(wallet.walletAddress);
                          handleFetchStats();
                        }}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="text-sm text-muted-foreground mt-4">
          <p>This table shows the wallets making the most API calls to FrenKabal. Click "View Details" to analyze a specific wallet's usage patterns.</p>
        </div>
      </Card>
    </div>
  );
}