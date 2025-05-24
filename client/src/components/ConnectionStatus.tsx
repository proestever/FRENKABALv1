import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useConnectionMonitor } from '@/hooks/useConnectionMonitor';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const { isOnline, serverStatus, isConnected } = useConnectionMonitor();

  if (isConnected) {
    return null; // Don't show indicator when everything is working
  }

  return (
    <div className={cn(
      "fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
      !isOnline ? "bg-red-500 text-white" :
      serverStatus === 'offline' ? "bg-orange-500 text-white" :
      "bg-yellow-500 text-black"
    )}>
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>No internet connection</span>
        </>
      ) : serverStatus === 'offline' ? (
        <>
          <AlertCircle className="h-4 w-4" />
          <span>Server unavailable</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4" />
          <span>Checking connection...</span>
        </>
      )}
    </div>
  );
}