import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Interfaces for the historical stats data
interface DailyStats {
  id: number;
  date: string;
  totalCalls: number;
  walletDataCalls: number;
  transactionCalls: number;
  tokenPriceCalls: number;
  tokenLogoCalls: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TotalStats {
  totalCalls: number | string;
  walletDataCalls: number | string;
  transactionCalls: number | string;
  tokenPriceCalls: number | string;
  tokenLogoCalls: number | string;
  cacheHits: number | string;
  cacheMisses: number | string;
  avgResponseTime: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

interface TopWalletStats {
  walletAddress: string;
  callCount: string | number;
}

interface TopEndpointStats {
  endpoint: string;
  callCount: string | number;
}

interface HistoricalApiStats {
  daily: DailyStats[];
  totals: TotalStats;
  topWallets: TopWalletStats[];
  topEndpoints: TopEndpointStats[];
  period: {
    days: number;
    start: string;
    end: string;
  };
}

export default function HistoricalApiStats() {
  const [stats, setStats] = useState<HistoricalApiStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('daily');
  const [period, setPeriod] = useState('30');
  const { account } = useAuth();

  // Load stats on component mount and when period changes
  useEffect(() => {
    fetchHistoricalStats();
  }, [period, account]);

  // Fetch historical API statistics
  const fetchHistoricalStats = async () => {
    if (!account) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/stats/historical?days=${period}`, {
        headers: {
          'Wallet-Address': account
        }
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          toast({
            title: 'Access Denied',
            description: 'You do not have permission to access historical stats',
            variant: 'destructive'
          });
          return;
        }
        
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching historical API stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load historical API statistics',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Format address for display
  const formatAddress = (address: string) => {
    if (!address) return 'N/A';
    if (address.length > 10) {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    return address;
  };

  // Calculate percentage
  const calculatePercentage = (part: string | number, total: string | number) => {
    const partNum = typeof part === 'string' ? parseInt(part) : part;
    const totalNum = typeof total === 'string' ? parseInt(total) : total;
    
    if (totalNum === 0) return '0%';
    return `${((partNum / totalNum) * 100).toFixed(1)}%`;
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (!stats?.daily) return [];
    
    // Sort by date ascending
    return [...stats.daily]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(day => ({
        date: day.date.substring(5), // Remove year for cleaner display
        'API Calls': day.totalCalls - day.cacheHits,
        'Cache Hits': day.cacheHits,
        'Total': day.totalCalls
      }));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Historical API Usage</span>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchHistoricalStats} 
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Long-term API usage statistics and trends
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Total Calls</div>
                <div className="text-2xl font-bold">{stats.totals.totalCalls}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Cache Hit Rate</div>
                <div className="text-2xl font-bold">
                  {stats.totals.cacheHits && stats.totals.totalCalls ? 
                    `${(parseInt(stats.totals.cacheHits.toString()) / parseInt(stats.totals.totalCalls.toString()) * 100).toFixed(1)}%` : 
                    '0%'}
                </div>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <div className="text-sm text-muted-foreground">Time Period</div>
                <div className="text-lg font-medium">
                  {stats.totals.firstDate ? 
                    `${stats.totals.firstDate} to ${stats.totals.lastDate}` : 
                    'No data'}
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="daily">Daily Stats</TabsTrigger>
                <TabsTrigger value="topWallets">Top Wallets</TabsTrigger>
                <TabsTrigger value="topEndpoints">Top Endpoints</TabsTrigger>
              </TabsList>
              
              <TabsContent value="daily" className="mt-4">
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={prepareChartData()}
                      margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="API Calls" fill="#3b82f6" />
                      <Bar dataKey="Cache Hits" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <Table className="mt-6">
                  <TableCaption>Daily API usage statistics</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">API Calls</TableHead>
                      <TableHead className="text-right">Cache Hits</TableHead>
                      <TableHead className="text-right">Hit Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.daily
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="font-medium">{day.date}</TableCell>
                          <TableCell className="text-right">{day.totalCalls - day.cacheHits}</TableCell>
                          <TableCell className="text-right">{day.cacheHits}</TableCell>
                          <TableCell className="text-right">
                            {day.totalCalls > 0 ? 
                              `${((day.cacheHits / day.totalCalls) * 100).toFixed(1)}%` : 
                              '0%'
                            }
                          </TableCell>
                          <TableCell className="text-right">{day.totalCalls}</TableCell>
                        </TableRow>
                    ))}
                    {stats.daily.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4">No daily data available</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              
              <TabsContent value="topWallets" className="mt-4">
                <Table>
                  <TableCaption>Top wallet addresses by API usage</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead className="text-right">Call Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topWallets.map((item) => (
                      <TableRow key={item.walletAddress}>
                        <TableCell className="font-medium">{formatAddress(item.walletAddress)}</TableCell>
                        <TableCell className="text-right">{item.callCount}</TableCell>
                        <TableCell className="text-right">
                          {calculatePercentage(item.callCount, stats.totals.totalCalls)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {stats.topWallets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">No wallet data available</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              
              <TabsContent value="topEndpoints" className="mt-4">
                <Table>
                  <TableCaption>Top API endpoints by usage</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Call Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topEndpoints.map((item) => (
                      <TableRow key={item.endpoint}>
                        <TableCell className="font-medium">{item.endpoint}</TableCell>
                        <TableCell className="text-right">{item.callCount}</TableCell>
                        <TableCell className="text-right">
                          {calculatePercentage(item.callCount, stats.totals.totalCalls)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {stats.topEndpoints.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">No endpoint data available</TableCell>
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
              <p className="text-muted-foreground">Loading historical statistics...</p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          {stats && `Period: ${stats.period.start} to ${stats.period.end}`}
        </div>
      </CardFooter>
    </Card>
  );
}