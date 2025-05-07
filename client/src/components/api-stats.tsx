import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface ApiCallStats {
  total: number;
  byWallet: Record<string, number>;
  byEndpoint: Record<string, number>;
  lastReset: number;
}

interface ApiStatsProps {
  isAdmin?: boolean;
}

export default function ApiStats({ isAdmin = false }: ApiStatsProps) {
  const [stats, setStats] = useState<ApiCallStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Load stats on component mount
  useEffect(() => {
    fetchStats();
    // Set up automatic refresh every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch API call statistics
  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/stats/api-calls');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching API stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load API call statistics',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset the API call counter
  const handleReset = async () => {
    try {
      setResetting(true);
      await apiRequest('/api/stats/reset-counter', {
        method: 'POST'
      });
      toast({
        title: 'Success',
        description: 'API call counter has been reset',
        variant: 'default'
      });
      // Refresh stats after reset
      fetchStats();
    } catch (error) {
      console.error('Error resetting API counter:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset API call counter',
        variant: 'destructive'
      });
    } finally {
      setResetting(false);
    }
  };

  // Format timestamp to readable date/time
  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  // Sort record entries by count (descending)
  const sortedEntries = (record: Record<string, number> = {}) => {
    return Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .filter(([key]) => key !== 'undefined' && key !== 'null');
  };

  // Abbreviate wallet addresses for display
  const formatAddress = (address: string) => {
    if (!address) return 'N/A';
    if (address === 'n/a') return 'N/A';
    if (address.length > 10) {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    return address;
  };

  // Calculate percentage of total
  const calculatePercentage = (count: number) => {
    if (!stats || stats.total === 0) return '0%';
    return `${((count / stats.total) * 100).toFixed(1)}%`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>API Call Statistics</span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchStats} 
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </CardTitle>
        <CardDescription>
          Monitor Moralis API usage and prevent rate limiting
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Total API Calls</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Unique Wallets</div>
                <div className="text-2xl font-bold">{Object.keys(stats.byWallet).length}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">API Endpoints</div>
                <div className="text-2xl font-bold">{Object.keys(stats.byEndpoint).length}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Last Reset</div>
                <div className="text-md font-medium">{formatDate(stats.lastReset)}</div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">API Endpoints</TabsTrigger>
                <TabsTrigger value="wallets">Wallet Distribution</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="mt-4">
                <Table>
                  <TableCaption>API calls by endpoint type</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEntries(stats.byEndpoint).map(([endpoint, count]) => (
                      <TableRow key={endpoint}>
                        <TableCell className="font-medium">{endpoint}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                        <TableCell className="text-right">{calculatePercentage(count)}</TableCell>
                      </TableRow>
                    ))}
                    {sortedEntries(stats.byEndpoint).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">No endpoint data available</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              
              <TabsContent value="wallets" className="mt-4">
                <Table>
                  <TableCaption>API calls by wallet address</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEntries(stats.byWallet).map(([wallet, count]) => (
                      <TableRow key={wallet}>
                        <TableCell className="font-medium">{formatAddress(wallet)}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                        <TableCell className="text-right">{calculatePercentage(count)}</TableCell>
                      </TableRow>
                    ))}
                    {sortedEntries(stats.byWallet).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">No wallet data available</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex justify-center items-center p-12">
            <div className="animate-pulse text-center">
              <p className="text-muted-foreground">Loading statistics...</p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          {stats && `Last refreshed: ${new Date().toLocaleTimeString()}`}
        </div>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={handleReset} 
          disabled={resetting || !stats}
        >
          {resetting ? 'Resetting...' : 'Reset Counter'}
        </Button>
      </CardFooter>
    </Card>
  );
}