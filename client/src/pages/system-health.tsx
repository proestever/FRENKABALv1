import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Server, Clock, HardDrive, Users, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface HealthData {
  status: string;
  uptime: number;
  uptimeFormatted: string;
  memory: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
    external: string;
  };
  lastHealthCheck: string;
  connections: number;
  timestamp: string;
}

interface StatusData {
  server: string;
  uptime: number;
  version: string;
  platform: string;
  environment: string;
}

export default function SystemHealthPage() {
  const { toast } = useToast();

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthData>({
    queryKey: ['/api/health'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<StatusData>({
    queryKey: ['/api/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchHealth(), refetchStatus()]);
      toast({
        title: "Data refreshed",
        description: "System health data has been updated",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not update system data",
        variant: "destructive",
      });
    }
  };

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return 'bg-green-500';
      case 'shutting_down':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  if (healthLoading && statusLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground">Monitor your application's performance and status</p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Server Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Server Status</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge 
                className={`${getStatusColor(healthData?.status || statusData?.server || 'unknown')} text-white`}
              >
                {healthData?.status || statusData?.server || 'Unknown'}
              </Badge>
              {statusData?.environment && (
                <Badge variant="outline">{statusData.environment}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {statusData?.platform} • Node.js {statusData?.version}
            </p>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {healthData?.uptimeFormatted || formatUptime(statusData?.uptime || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Started {new Date(Date.now() - (statusData?.uptime || 0)).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        {/* Active Connections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthData?.connections || 0}</div>
            <p className="text-xs text-muted-foreground">Active connections</p>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthData?.memory ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-lg font-semibold">{healthData.memory.heapUsed}</div>
                  <p className="text-xs text-muted-foreground">Heap Used</p>
                </div>
                <div>
                  <div className="text-lg font-semibold">{healthData.memory.heapTotal}</div>
                  <p className="text-xs text-muted-foreground">Heap Total</p>
                </div>
                <div>
                  <div className="text-lg font-semibold">{healthData.memory.rss}</div>
                  <p className="text-xs text-muted-foreground">RSS</p>
                </div>
                <div>
                  <div className="text-lg font-semibold">{healthData.memory.external}</div>
                  <p className="text-xs text-muted-foreground">External</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Memory data unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* Last Updated */}
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Health Check</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {healthData?.lastHealthCheck ? 
                new Date(healthData.lastHealthCheck).toLocaleString() : 
                'No data available'
              }
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              System monitoring is active and checking every 30 seconds
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}