import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCw, Loader2 } from 'lucide-react';
import { useDirectWalletBalances } from '@/hooks/use-direct-wallet-balances';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface RealTimeBalanceButtonProps {
  walletAddress: string | null;
  onBalancesUpdated?: () => void;
}

/**
 * Button component for refreshing wallet balances directly from the blockchain
 * This is useful for getting real-time balances immediately after swaps
 */
export function RealTimeBalanceButton({ 
  walletAddress,
  onBalancesUpdated
}: RealTimeBalanceButtonProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState<string>('');
  const { toast } = useToast();
  
  // Use the direct wallet balances hook
  // We set enabled to false so it doesn't fetch automatically
  // We'll only manually fetch when the user clicks the refresh button
  const {
    isLoading,
    isFetching,
    isRefreshing,
    refreshBalances,
    walletData
  } = useDirectWalletBalances(walletAddress, false);
  
  // Track when balances were last updated
  useEffect(() => {
    if (walletData && !isLoading && !isFetching) {
      setLastUpdated(new Date());
      
      // Also invalidate the regular wallet data queries to ensure all views refresh
      if (walletAddress) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/wallet/${walletAddress}`]
        });
        
        // Also invalidate the "all" tokens query
        queryClient.invalidateQueries({
          queryKey: [`wallet-all-${walletAddress}`]
        });
        
        // Call the callback if provided
        if (onBalancesUpdated) {
          onBalancesUpdated();
        }
      }
    }
  }, [walletData, isLoading, isFetching, walletAddress, onBalancesUpdated]);
  
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
  
  // Handle refresh
  const handleRefresh = async () => {
    if (!walletAddress || isLoading || isFetching || isRefreshing) return;
    
    try {
      toast({
        title: 'Refreshing balances',
        description: 'Getting real-time balances directly from the blockchain...',
        duration: 3000,
      });
      
      await refreshBalances();
      
      toast({
        title: 'Balances updated',
        description: 'Your wallet balances have been refreshed with the latest blockchain data.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error refreshing balances:', error);
      toast({
        title: 'Error refreshing balances',
        description: 'There was an error getting your real-time balances. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleRefresh}
        size="sm"
        variant="outline"
        className="flex items-center gap-1 h-8 px-2"
        disabled={!walletAddress || isLoading || isFetching || isRefreshing}
      >
        {isLoading || isFetching || isRefreshing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/70" />
        ) : (
          <RotateCw className="h-3.5 w-3.5 text-primary/70" />
        )}
        <span className="whitespace-nowrap text-xs">Real-time Update</span>
      </Button>
      
      {lastUpdated && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Updated {timeAgo}
        </span>
      )}
    </div>
  );
}