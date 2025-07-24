import { useWebSocketStatus } from '@/hooks/use-live-wallet-balances';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WebSocketStatus() {
  const { data: status, isLoading } = useWebSocketStatus();
  
  if (isLoading || !status) {
    return null;
  }
  
  const isConnected = status.isWebSocketConnected;
  
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={cn(
          "relative flex h-2 w-2",
          isConnected ? "text-green-500" : "text-red-500"
        )}
      >
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            isConnected ? "bg-green-400" : "bg-red-400"
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            isConnected ? "bg-green-500" : "bg-red-500"
          )}
        />
      </div>
      
      <span className="text-muted-foreground">
        {isConnected ? 'Live Updates Active' : 'Live Updates Offline'}
      </span>
      
      {isConnected && status.trackedWallets > 0 && (
        <span className="text-muted-foreground">
          • {status.trackedWallets} wallet{status.trackedWallets !== 1 ? 's' : ''} tracked
        </span>
      )}
    </div>
  );
}

export function WebSocketStatusBadge({ className }: { className?: string }) {
  const { data: status } = useWebSocketStatus();
  
  if (!status?.isWebSocketConnected) {
    return null;
  }
  
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Activity className="h-3.5 w-3.5 text-green-500 animate-pulse" />
      <span className="text-xs text-muted-foreground">Real-time</span>
    </div>
  );
}