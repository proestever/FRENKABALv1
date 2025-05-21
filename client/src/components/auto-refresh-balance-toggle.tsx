import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAutoRefreshBalances } from '@/hooks/use-auto-refresh-balances';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AutoRefreshBalanceToggleProps {
  walletAddress: string | null;
  onBalancesUpdated?: () => void;
}

export function AutoRefreshBalanceToggle({
  walletAddress,
  onBalancesUpdated
}: AutoRefreshBalanceToggleProps) {
  const [enabled, setEnabled] = useState(true);

  const {
    isMonitoring,
    toggleMonitoring,
    lastSwapEvent,
    isRefreshing,
    manualRefresh
  } = useAutoRefreshBalances({
    walletAddress,
    enabled,
    notifyOnRefresh: true,
    checkIntervalMs: 5000
  });

  // Format last update time if available
  const lastUpdateText = lastSwapEvent 
    ? formatDistanceToNow(new Date(lastSwapEvent.timestamp), { addSuffix: true })
    : 'Never';

  // Handle toggle change
  const handleToggleChange = (checked: boolean) => {
    setEnabled(checked);
    
    // If enabling and we have a wallet address, try an initial balance refresh
    if (checked && walletAddress && !isRefreshing) {
      manualRefresh().then(() => {
        if (onBalancesUpdated) {
          onBalancesUpdated();
        }
      });
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex items-center space-x-2 justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto-refresh">Auto-refresh balances</Label>
          <p className="text-xs text-gray-400">
            Automatically refreshes balances after swaps
          </p>
        </div>
        <Switch
          id="auto-refresh"
          checked={enabled}
          onCheckedChange={handleToggleChange}
        />
      </div>
      
      {enabled && (
        <div className="text-xs text-gray-400 flex items-center">
          {isRefreshing ? (
            <div className="flex items-center">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              <span>Refreshing balances...</span>
            </div>
          ) : (
            <div>
              {isMonitoring ? (
                <span>Monitoring for swaps • Last refresh: {lastUpdateText}</span>
              ) : (
                <span>Starting monitor...</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}