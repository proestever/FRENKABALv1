import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Bookmark } from '@shared/schema';
import { ExternalLink, Copy, RotateCw, Bookmark as BookmarkIcon, CheckCircle } from 'lucide-react';
import { formatCurrency, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass, truncateAddress } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TokenLogo } from '@/components/token-logo';
import { useState, useEffect } from 'react';
import { getHiddenTokens, isTokenHidden, isAddressBookmarked } from '@/lib/api';
import { useWallet } from '@/hooks/use-wallet';
import { BookmarkDialog } from '@/components/bookmark-dialog';

interface WalletOverviewProps {
  wallet: Wallet;
  isLoading: boolean;
  onRefresh: () => void;
}

export function WalletOverview({ wallet, isLoading, onRefresh }: WalletOverviewProps) {
  const { toast } = useToast();
  const { account: connectedWalletAddress, isConnected } = useWallet();
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);
  const [totalVisibleValue, setTotalVisibleValue] = useState<number>(0);
  const [visibleTokenCount, setVisibleTokenCount] = useState<number>(0);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [existingBookmark, setExistingBookmark] = useState<Bookmark | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isCheckingBookmark, setIsCheckingBookmark] = useState(false);

  // Check if the current wallet is bookmarked
  useEffect(() => {
    const checkIfBookmarked = async () => {
      if (!wallet || !isConnected || !connectedWalletAddress) return;
      
      // Get the user ID from the connected wallet address
      // For now, we'll use a simple hash of the address as the ID
      const userId = parseInt(connectedWalletAddress.slice(2, 10), 16) % 1000000;
      
      setIsCheckingBookmark(true);
      try {
        const bookmark = await isAddressBookmarked(userId, wallet.address);
        setIsBookmarked(!!bookmark);
        setExistingBookmark(bookmark);
      } catch (error) {
        console.error('Error checking bookmark status:', error);
      } finally {
        setIsCheckingBookmark(false);
      }
    };
    
    checkIfBookmarked();
  }, [wallet, isConnected, connectedWalletAddress]);

  useEffect(() => {
    // Get hidden tokens from localStorage
    setHiddenTokens(getHiddenTokens());
    
    // Listen for token visibility changes
    const handleTokenVisibilityChange = () => {
      setHiddenTokens(getHiddenTokens());
    };
    
    window.addEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (wallet && wallet.tokens) {
      // Calculate total value excluding hidden tokens
      const visibleTokens = wallet.tokens.filter(token => !hiddenTokens.includes(token.address));
      const visibleTotal = visibleTokens.reduce((sum, token) => {
        return sum + (token.value || 0);
      }, 0);
      setTotalVisibleValue(visibleTotal);
      setVisibleTokenCount(visibleTokens.length);
    }
  }, [wallet, hiddenTokens]);

  if (!wallet) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    toast({
      title: "Address copied",
      description: "Wallet address copied to clipboard",
      duration: 3000,
    });
  };

  const plsPriceChangeClass = getAdvancedChangeClass(wallet.plsPriceChange || 0);
  const totalValueChangeClass = 'text-success border border-success/30 bg-success/10 px-1.5 py-0.5 rounded'; // This would be dynamic if we had portfolio change data

  // Handle bookmark creation/update
  const handleBookmarkCreated = (bookmark: Bookmark) => {
    setIsBookmarked(true);
    setExistingBookmark(bookmark);
  };
  
  const handleBookmarkUpdated = (bookmark: Bookmark) => {
    setExistingBookmark(bookmark);
  };
  
  const handleBookmarkDeleted = () => {
    setIsBookmarked(false);
    setExistingBookmark(null);
  };
  
  // Get user ID from wallet address
  const getUserId = () => {
    if (!connectedWalletAddress) return null;
    // Simple hash of address as user ID
    return parseInt(connectedWalletAddress.slice(2, 10), 16) % 1000000;
  };

  return (
    <section className="mb-8">
      {/* Bookmark Dialog */}
      {isConnected && (
        <BookmarkDialog
          isOpen={bookmarkDialogOpen}
          onClose={() => setBookmarkDialogOpen(false)}
          walletAddress={wallet.address}
          userId={getUserId()}
          existingBookmark={existingBookmark}
          onBookmarkCreated={handleBookmarkCreated}
          onBookmarkUpdated={handleBookmarkUpdated}
          onBookmarkDeleted={handleBookmarkDeleted}
        />
      )}
      
      <Card className="p-6 glass-card shadow-lg border-white/15">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Wallet Overview</h2>
            <div className="flex items-center mt-1">
              <span className="text-sm text-muted-foreground mr-2">{wallet.address}</span>
              <Button variant="ghost" size="icon" onClick={handleCopyAddress} className="h-6 w-6 text-white glass-card hover:bg-black/20 p-0.5">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href={`https://scan.pulsechain.com/address/${wallet.address}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white glass-card hover:bg-black/20 transition-all text-sm flex items-center px-2 py-1 rounded-md border-white/15"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View on PulseScan
            </a>
            {isConnected && (
              <Button
                variant="outline"
                onClick={() => setBookmarkDialogOpen(true)}
                disabled={isCheckingBookmark}
                className={`glass-card border-white/15 text-sm h-8 hover:bg-black/20 hover:text-white flex items-center px-2 ${
                  isBookmarked ? 'bg-green-500/10 text-green-300 hover:text-green-200' : ''
                }`}
              >
                {isBookmarked ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Bookmarked
                  </>
                ) : (
                  <>
                    <BookmarkIcon className="h-4 w-4 mr-1" />
                    Bookmark
                  </>
                )}
              </Button>
            )}
            <Button 
              variant="outline" 
              size="icon" 
              onClick={onRefresh}
              disabled={isLoading}
              className="glass-card border-white/15 h-8 w-8 hover:bg-black/20 hover:text-white"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Total Value (Visible)</div>
            <div className="text-2xl font-bold text-white">
              {totalVisibleValue !== undefined ? formatCurrency(totalVisibleValue) : 'N/A'}
            </div>
            <div className="text-sm mt-2 flex items-center">
              <span className="text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-md font-medium">+2.34% (24h)</span>
            </div>
          </div>
          
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Token Count (Visible)</div>
            <div className="text-2xl font-bold text-white">
              {visibleTokenCount || 0}
            </div>
            <div className="text-sm mt-2 flex items-center">
              <span className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 rounded-md font-medium">
                {hiddenTokens.length > 0 && `(${hiddenTokens.length} hidden)`}
              </span>
            </div>
          </div>
          
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="flex items-center mb-2">
              <TokenLogo 
                address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" /* PLS native token address */
                symbol="PLS"
                size="sm"
              />
              <div className="text-sm text-muted-foreground ml-2">PLS Balance</div>
            </div>
            <div className="text-2xl font-bold text-white">
              {wallet.plsBalance !== null && wallet.plsBalance !== undefined ? 
                `${formatTokenAmount(wallet.plsBalance)} PLS` : 
                'N/A'
              }
            </div>
            {wallet.plsPriceChange !== null && wallet.plsPriceChange !== undefined && (
              <div className="text-sm mt-2 flex items-center">
                <span className={wallet.plsPriceChange > 0 
                  ? "text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-md font-medium"
                  : "text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded-md font-medium"
                }>
                  {wallet.plsPriceChange > 0 ? '+' : ''}{wallet.plsPriceChange.toFixed(1)}% (24h)
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
