import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Bookmark } from '@shared/schema';
import { ExternalLink, Copy, RotateCw, Bookmark as BookmarkIcon, CheckCircle, GitCompareArrows } from 'lucide-react';
import { formatCurrency, formatTokenAmount, getChangeColorClass, getAdvancedChangeClass, truncateAddress } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TokenLogo } from '@/components/token-logo';
import { useState, useEffect } from 'react';
import { getHiddenTokens, isTokenHidden, isAddressBookmarked } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { BookmarkDialog } from '@/components/bookmark-dialog';
import { useHexStakes } from '@/hooks/use-hex-stakes';

interface WalletOverviewProps {
  wallet: Wallet;
  isLoading: boolean;
  onRefresh: () => void;
}

export function WalletOverview({ wallet, isLoading, onRefresh }: WalletOverviewProps) {
  const { toast } = useToast();
  const { account: connectedWalletAddress, isConnected, userId } = useAuth();
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);
  const [totalVisibleValue, setTotalVisibleValue] = useState<number>(0);
  const [visibleTokenCount, setVisibleTokenCount] = useState<number>(0);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [existingBookmark, setExistingBookmark] = useState<Bookmark | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isCheckingBookmark, setIsCheckingBookmark] = useState(false);
  
  // Get HEX stakes data
  const hexStakesSummary = useHexStakes(wallet?.address);

  // Check if the current wallet is bookmarked
  useEffect(() => {
    const checkIfBookmarked = async () => {
      if (!wallet || !isConnected || !userId) return;
      
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
  }, [wallet, isConnected, userId]);

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
  
  return (
    <section className="mb-8">
      {/* Bookmark Dialog */}
      {isConnected && userId && (
        <BookmarkDialog
          isOpen={bookmarkDialogOpen}
          onClose={() => setBookmarkDialogOpen(false)}
          walletAddress={wallet.address}
          userId={userId}
          existingBookmark={existingBookmark}
          onBookmarkCreated={handleBookmarkCreated}
          onBookmarkUpdated={handleBookmarkUpdated}
          onBookmarkDeleted={handleBookmarkDeleted}
        />
      )}
      
      <Card className="p-6 glass-card shadow-lg border-white/15 h-full">
        {/* Header - Title, Address and Action Buttons */}
        <div className="flex flex-col mb-6">
          <div className="mb-3">
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center">
              Wallet Overview
              {existingBookmark && existingBookmark.label && (
                <span className="ml-2 flex items-center"><span className="text-green-400 font-bold text-lg md:text-xl ml-2">{existingBookmark.label}</span></span>
              )}
            </h2>
            <div className="flex items-center mt-1 max-w-full overflow-hidden">
              {/* Always show truncated address for better fit in narrower layout */}
              <span className="text-sm text-muted-foreground mr-2 metallic-address overflow-hidden text-ellipsis whitespace-nowrap">
                {truncateAddress(wallet.address, 10, 8)}
              </span>
              <Button variant="ghost" size="icon" onClick={handleCopyAddress} className="h-6 w-6 text-white glass-card hover:bg-black/20 p-0.5 flex-shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <a 
              href={`https://scan.pulsechain.com/address/${wallet.address}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white glass-card hover:bg-black/20 transition-all text-sm flex items-center h-8 px-3 rounded-md border border-white/15"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              PulseScan
            </a>
            {isConnected && (
              <Button
                variant="outline"
                onClick={() => setBookmarkDialogOpen(true)}
                disabled={isCheckingBookmark || !userId}
                className={`glass-card border-white/15 text-sm h-8 hover:bg-black/20 hover:text-white flex items-center ${
                  isBookmarked ? 'bg-green-500/10 text-green-300 hover:text-green-200' : ''
                }`}
                title={!userId ? "Wallet authentication required" : ""}
              >
                {isBookmarked ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Saved
                  </>
                ) : (
                  <>
                    <BookmarkIcon className="h-4 w-4 mr-1" />
                    Save
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
        
        {/* Stats - Re-arranged to stack vertically */}
        <div className="space-y-4">
          {/* Total Value Card - Now first */}
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Total Value (Visible)</div>
            <div className="text-xl md:text-2xl font-bold text-white">
              {totalVisibleValue !== undefined ? formatCurrency(totalVisibleValue) : 'N/A'}
            </div>
            <div className="text-sm mt-2 flex items-center">
              <span className="text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-md font-medium">+2.34% (24h)</span>
            </div>
          </div>
          
          {/* PLS Balance Card - Now second */}
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="flex items-center mb-2">
              <TokenLogo 
                address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" /* PLS native token address */
                symbol="PLS"
                size="sm"
              />
              <div className="text-sm text-muted-foreground ml-2">PLS Balance</div>
            </div>
            <div className="text-xl md:text-2xl font-bold text-white">
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
          
          {/* HEX Stakes Card */}
          {hexStakesSummary.stakeCount > 0 && (
            <div className="glass-card rounded-lg p-4 border-white/15">
              <div className="flex items-center mb-2">
                <TokenLogo 
                  address="0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" /* HEX token address */
                  symbol="HEX"
                  size="sm"
                />
                <div className="text-sm text-muted-foreground ml-2">HEX Stakes</div>
                <div className="flex items-center ml-auto">
                  <GitCompareArrows size={16} className="text-purple-300 mr-1" />
                  <span className="text-xs text-purple-300">Both PLS/ETH</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <div className="text-xs text-muted-foreground">Total Staked</div>
                  <div className="text-lg font-bold text-white">
                    {formatTokenAmount(parseFloat(hexStakesSummary.totalStakedHex))} HEX
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(hexStakesSummary.totalStakeValueUsd)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Interest</div>
                  <div className="text-lg font-bold text-green-400">
                    {formatTokenAmount(parseFloat(hexStakesSummary.totalInterestHex))} HEX
                  </div>
                  <div className="text-xs text-green-400">
                    {formatCurrency(hexStakesSummary.totalInterestValueUsd)}
                  </div>
                </div>
              </div>
              
              <div className="mt-2">
                <div className="text-xs text-muted-foreground">Combined Value</div>
                <div className="text-lg font-bold text-white">
                  {formatTokenAmount(parseFloat(hexStakesSummary.totalCombinedHex))} HEX
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(hexStakesSummary.totalCombinedValueUsd)}
                </div>
              </div>
              
              <div className="text-sm mt-2 flex items-center justify-between">
                <span className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 rounded-md font-medium">
                  {hexStakesSummary.stakeCount} {hexStakesSummary.stakeCount === 1 ? 'stake' : 'stakes'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {hexStakesSummary.hexPrice > 0 ? `1 HEX = ${formatCurrency(hexStakesSummary.hexPrice)}` : ''}
                </span>
              </div>
            </div>
          )}
          
          {/* Token Count Card */}
          <div className="glass-card rounded-lg p-4 border-white/15">
            <div className="text-sm text-muted-foreground mb-1">Token Count (Visible)</div>
            <div className="text-xl md:text-2xl font-bold text-white">
              {visibleTokenCount || 0}
            </div>
            <div className="text-sm mt-2 flex items-center">
              {hiddenTokens.length > 0 && (
                <span className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 rounded-md font-medium">
                  ({hiddenTokens.length} hidden)
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
