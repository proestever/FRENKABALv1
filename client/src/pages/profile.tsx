import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { Bookmark } from "@shared/schema";
import { Home, ExternalLink, Star, Trash2, Wallet } from "lucide-react";
import { formatAccount } from "../lib/format";

export function Profile() {
  const { isConnected, account, userId } = useWallet();
  const [, setLocation] = useLocation();
  
  // Redirect to home if not connected - with a delay to ensure wallet state is fully loaded
  useEffect(() => {
    // Add a small delay to allow the wallet state to fully load
    const checkConnection = setTimeout(() => {
      if (!isConnected || !account) {
        toast({
          title: "Authentication Required",
          description: "Please connect your wallet to view your profile.",
          variant: "destructive"
        });
        setLocation("/");
      } else {
        console.log("Profile accessed with wallet:", account);
      }
    }, 500);
    
    return () => clearTimeout(checkConnection);
  }, [isConnected, account, setLocation]);

  // Fetch user's bookmarks
  const { 
    data: bookmarks, 
    isLoading, 
    isError, 
    refetch 
  } = useQuery<Bookmark[]>({
    queryKey: ['/api/bookmarks', userId],
    enabled: !!userId,
  });

  const handleDeleteBookmark = async (id: number) => {
    try {
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast({
          title: "Bookmark Deleted",
          description: "The wallet has been removed from your bookmarks.",
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete bookmark. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (!isConnected || !account) {
    return null; // Will be redirected by the useEffect
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Your Profile</h1>
          <p className="text-muted-foreground">
            Connected as: {formatAccount(account)}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setLocation("/")}
          className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
        >
          <Home className="w-4 h-4 mr-2" />
          Home
        </Button>
      </div>

      <Card className="mb-8 glass-card border-white/15">
        <CardHeader>
          <CardTitle className="text-white">Saved Wallets</CardTitle>
          <CardDescription>
            View and manage your bookmarked wallet addresses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 border border-white/10 rounded-md">
                  <Skeleton className="h-6 w-[250px] bg-white/5" />
                  <Skeleton className="h-8 w-[100px] bg-white/5" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center p-6">
              <p className="text-red-400">Error loading bookmarks. Please try again.</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()}
                className="mt-4 glass-card border-white/15 hover:bg-black/20 hover:text-white"
              >
                Retry
              </Button>
            </div>
          ) : bookmarks && bookmarks.length > 0 ? (
            <div className="space-y-3">
              {bookmarks.map((bookmark) => (
                <div 
                  key={bookmark.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-white/10 rounded-md bg-black/20 hover:bg-black/30 transition-colors"
                >
                  <div className="mb-3 sm:mb-0">
                    <div className="flex items-center">
                      <Wallet className="h-4 w-4 mr-2 text-primary" />
                      <h3 className="font-medium text-white">
                        {bookmark.label || formatAccount(bookmark.walletAddress)}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {bookmark.label ? formatAccount(bookmark.walletAddress) : ''}
                    </p>
                    {bookmark.notes && (
                      <p className="text-sm text-muted-foreground mt-1 italic">
                        "{bookmark.notes}"
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button 
                      variant="outline" 
                      size="sm"
                      asChild
                      className="glass-card border-white/15 hover:bg-black/20 hover:text-white h-8"
                    >
                      <Link href={`/${bookmark.walletAddress}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View
                      </Link>
                    </Button>
                    {bookmark.isFavorite && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        className="glass-card border-white/15 bg-yellow-500/10 text-yellow-300 hover:text-yellow-200 hover:bg-yellow-500/20 h-8 w-8"
                        title="Favorite"
                      >
                        <Star className="h-3.5 w-3.5" fill="currentColor" />
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleDeleteBookmark(bookmark.id)}
                      className="glass-card border-white/15 hover:bg-red-500/20 hover:text-red-300 h-8 w-8"
                      title="Delete bookmark"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-md">
              <p className="text-muted-foreground mb-4">You haven't saved any wallet addresses yet.</p>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/")}
                className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
              >
                <Home className="w-4 h-4 mr-2" />
                Go Home to Search Wallets
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Profile;