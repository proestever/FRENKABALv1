import { useEffect, useState } from 'react';

interface LastUpdatedInfoProps {
  walletAddress: string | null;
  onBalancesUpdated?: () => void;
}

/**
 * Component that displays when wallet balances were last updated
 */
export function LastUpdatedInfo({ 
  walletAddress,
  onBalancesUpdated
}: LastUpdatedInfoProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState<string>('');
  
  // Set last updated to now when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      setLastUpdated(new Date());
      
      // Call the callback if provided
      if (onBalancesUpdated) {
        onBalancesUpdated();
      }
    }
  }, [walletAddress, onBalancesUpdated]);
  
  // Update the "time ago" string
  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTimeAgo = () => {
      if (!lastUpdated) return;
      
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
      
      if (diffInSeconds < 5) {
        setTimeAgo('just now');
      } else if (diffInSeconds < 60) {
        setTimeAgo(`${diffInSeconds}s ago`);
      } else if (diffInSeconds < 3600) {
        setTimeAgo(`${Math.floor(diffInSeconds / 60)}m ago`);
      } else {
        setTimeAgo(`${Math.floor(diffInSeconds / 3600)}h ago`);
      }
    };
    
    // Update immediately and then every second
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);
    
    return () => clearInterval(interval);
  }, [lastUpdated]);
  
  return (
    <div className="flex items-center gap-2">
      {lastUpdated && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Updated {timeAgo}
        </span>
      )}
    </div>
  );
}