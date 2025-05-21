import { Button } from '@/components/ui/button';
import { RotateCw, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { fetchDirectWalletBalances } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface RealTimeBalanceButtonProps {
  walletAddress: string | null;
  onSuccess?: () => void;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon'; 
  showLabel?: boolean;
}

/**
 * A button that directly queries the blockchain for token balances
 * This bypasses any API cache and gives the most up-to-date balances after swaps
 */
export function RealTimeBalanceButton({
  walletAddress,
  onSuccess,
  variant = 'secondary',
  size = 'default',
  showLabel = true
}: RealTimeBalanceButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  
  const handleRefresh = async () => {
    if (!walletAddress || isRefreshing) return;
    
    setIsRefreshing(true);
    const startTime = Date.now();
    
    try {
      // Show toast notification
      toast({
        title: "Getting real-time balances",
        description: "Fetching latest token balances directly from the blockchain...",
        duration: 3000,
      });
      
      // Fetch directly from blockchain
      const freshData = await fetchDirectWalletBalances(walletAddress);
      
      // Calculate how long it took
      const refreshTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: [`wallet-all-${walletAddress}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/wallet/${walletAddress}`] });
      
      // If in a multi-wallet view, also invalidate the combined wallet data
      queryClient.invalidateQueries({ queryKey: ['combined-wallet'] });
      
      // Show success notification
      toast({
        title: "Real-time Update Complete",
        description: `Refreshed ${freshData.tokens.length} tokens in ${refreshTime}s directly from blockchain`,
        duration: 3000,
      });
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error refreshing from blockchain:', error);
      toast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Could not refresh wallet data",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isRefreshing || !walletAddress}
      className="flex items-center gap-1"
    >
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCw className="h-4 w-4" />
      )}
      {showLabel && <span>Real-time Balances</span>}
    </Button>
  );
}