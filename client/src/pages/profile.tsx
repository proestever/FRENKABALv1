import { useEffect, useState, useRef } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/hooks/use-wallet";
import { Bookmark } from "@shared/schema";
import { 
  Home, 
  ExternalLink, 
  Star, 
  Trash2, 
  Wallet, 
  Pencil, 
  Clock, 
  Calendar, 
  Download, 
  Upload, 
  FileUp, 
  FileDown, 
  AlertTriangle 
} from "lucide-react";
import { 
  bookmarksToCSV, 
  csvToBookmarks, 
  downloadAsFile,
  getExampleCSV 
} from "@/lib/csv-utils";
import { formatAccount } from "../lib/format";

export function Profile() {
  const { isConnected, account, userId } = useWallet();
  const [, setLocation] = useLocation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [currentBookmark, setCurrentBookmark] = useState<Bookmark | null>(null);
  const [editedLabel, setEditedLabel] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch user's bookmarks
  const { 
    data: bookmarks, 
    isLoading, 
    isError, 
    refetch 
  } = useQuery<Bookmark[]>({
    queryKey: ['/api/bookmarks'],
    queryFn: async () => {
      if (!userId) {
        console.warn("No userId available for fetching bookmarks");
        return [];
      }
      const response = await fetch(`/api/bookmarks?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bookmarks');
      }
      return response.json();
    },
    enabled: !!userId && isConnected,
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
  
  const handleToggleFavorite = async (id: number, isFavorite: boolean) => {
    try {
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFavorite }),
      });
      
      if (response.ok) {
        toast({
          title: isFavorite ? "Added to Favorites" : "Removed from Favorites",
          description: isFavorite 
            ? "This wallet has been added to your favorites." 
            : "This wallet has been removed from your favorites.",
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to update favorite status. Please try again.",
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
  
  const handleEditBookmark = (bookmark: Bookmark) => {
    setCurrentBookmark(bookmark);
    setEditedLabel(bookmark.label || '');
    setEditedNotes(bookmark.notes || '');
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    if (!currentBookmark) return;
    
    try {
      const response = await fetch(`/api/bookmarks/${currentBookmark.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: editedLabel,
          notes: editedNotes,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Bookmark Updated",
          description: "Your wallet bookmark has been updated successfully.",
        });
        setIsEditDialogOpen(false);
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to update bookmark. Please try again.",
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
        // Refresh bookmarks data whenever we visit the profile page
        refetch();
      }
    }, 500);
    
    return () => clearTimeout(checkConnection);
  }, [isConnected, account, setLocation, refetch]);
  
  // Format date in a user-friendly way
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
            <div className="overflow-x-auto rounded-md border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left bg-black/20">
                    <th className="py-3 px-2 text-sm text-white/60 font-medium w-[50px]"></th>
                    <th className="py-3 px-2 text-sm text-white/60 font-medium">Name</th>
                    <th className="py-3 px-2 text-sm text-white/60 font-medium hidden md:table-cell">Address</th>
                    <th className="py-3 px-2 text-sm text-white/60 font-medium hidden md:table-cell">Notes</th>
                    <th className="py-3 px-2 text-sm text-white/60 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookmarks.map((bookmark) => (
                    <tr 
                      key={bookmark.id} 
                      className={`border-b border-white/5 hover:bg-black/30 transition-colors ${
                        bookmark.isFavorite ? "bg-yellow-950/5" : ""
                      }`}
                    >
                      {/* Favorite Star */}
                      <td className="py-2 px-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleToggleFavorite(bookmark.id, !bookmark.isFavorite)}
                          className={`h-7 w-7 ${
                            bookmark.isFavorite 
                              ? "text-yellow-300" 
                              : "text-muted-foreground hover:text-yellow-300"
                          }`}
                        >
                          <Star className="h-4 w-4" fill={bookmark.isFavorite ? "currentColor" : "none"} />
                        </Button>
                      </td>
                      
                      {/* Name & Address (mobile view combines these) */}
                      <td className="py-2 px-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">
                            {bookmark.label || formatAccount(bookmark.walletAddress)}
                          </span>
                          
                          {/* Mobile-only address */}
                          <span className="font-mono text-xs text-muted-foreground mt-1 md:hidden">
                            {formatAccount(bookmark.walletAddress)}
                          </span>
                          
                          {/* Mobile-only notes */}
                          <span className="text-xs text-muted-foreground mt-1 md:hidden">
                            {bookmark.notes ? (
                              <span className="italic">"{bookmark.notes}"</span>
                            ) : (
                              <span className="text-muted-foreground/50">No notes</span>
                            )}
                          </span>
                        </div>
                      </td>
                      
                      {/* Address - Desktop only */}
                      <td className="py-2 px-2 hidden md:table-cell">
                        <span className="font-mono text-sm text-muted-foreground">
                          {formatAccount(bookmark.walletAddress)}
                        </span>
                      </td>
                      
                      {/* Notes - Desktop only */}
                      <td className="py-2 px-2 text-sm text-muted-foreground hidden md:table-cell">
                        {bookmark.notes ? (
                          <span className="italic">"{bookmark.notes}"</span>
                        ) : (
                          <span className="text-muted-foreground/50">No notes</span>
                        )}
                      </td>
                      
                      {/* Actions */}
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            asChild
                            className="h-7 w-7 p-0 hover:bg-black/30 hover:text-white rounded-full"
                            title="View Wallet"
                          >
                            <Link href={`/${bookmark.walletAddress}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-black/30 hover:text-white rounded-full"
                            title="Edit Bookmark"
                            onClick={() => handleEditBookmark(bookmark)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-black/30 hover:text-red-400 rounded-full"
                            title="Delete Bookmark"
                            onClick={() => handleDeleteBookmark(bookmark.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* CSV Export/Import Buttons */}
              <div className="flex justify-end mt-4 space-x-2 p-3 border-t border-white/10">
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (bookmarks && bookmarks.length > 0) {
                      const csv = bookmarksToCSV(bookmarks);
                      downloadAsFile(csv, "frenklabal-saved-wallets.csv", "text/csv");
                      toast({
                        title: "Export Successful",
                        description: "Your saved wallets have been exported to CSV.",
                      });
                    }
                  }}
                  className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
                  disabled={!bookmarks || bookmarks.length === 0}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsImportDialogOpen(true)}
                  className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
                >
                  <FileUp className="w-4 h-4 mr-2" />
                  Import CSV
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-md">
              <p className="text-muted-foreground mb-4">You haven't saved any wallet addresses yet.</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setLocation("/")}
                  className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home to Search Wallets
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setIsImportDialogOpen(true)}
                  className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
                >
                  <FileUp className="w-4 h-4 mr-2" />
                  Import CSV
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Edit Bookmark Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="glass-card border-white/15 bg-black/80 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Bookmark</DialogTitle>
            <DialogDescription>
              Update the details for this saved wallet.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-address" className="text-white">Wallet Address</Label>
              <div className="p-2 bg-black/50 rounded-md border border-white/10 text-sm font-mono text-muted-foreground">
                {currentBookmark?.walletAddress}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="label" className="text-white">Label</Label>
              <Input
                id="label"
                value={editedLabel}
                onChange={(e) => setEditedLabel(e.target.value)}
                placeholder="My Primary Wallet"
                className="bg-black/50 border-white/10 text-white focus:border-primary"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-white">Notes</Label>
              <Textarea
                id="notes"
                value={editedNotes || ''}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Any additional notes about this wallet..."
                className="bg-black/50 border-white/10 text-white focus:border-primary min-h-[100px]"
              />
            </div>
          </div>
          
          <DialogFooter className="flex sm:justify-between">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              className="glass-card border-white/15"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              className="bg-primary hover:bg-primary/90"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="glass-card border-white/15 bg-black/80 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Import Saved Wallets</DialogTitle>
            <DialogDescription>
              Import wallet addresses from a CSV file.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="csv-data" className="text-white">CSV Data</Label>
              <Textarea
                id="csv-data"
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder="Paste your CSV data here..."
                className="bg-black/50 border-white/10 text-white focus:border-primary min-h-[150px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: Wallet Address, Label, Notes, Is Favorite
              </p>
            </div>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Load sample CSV
                  setImportCsvText(getExampleCSV());
                }}
                className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Load Example
              </Button>
              
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      if (event.target?.result) {
                        setImportCsvText(event.target.result as string);
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="glass-card border-white/15 hover:bg-black/20 hover:text-white"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV File
              </Button>
            </div>
          </div>
          
          <DialogFooter className="flex sm:justify-between">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportCsvText("");
              }}
              className="glass-card border-white/15"
            >
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!importCsvText.trim() || !userId) {
                  toast({
                    title: "Error",
                    description: "Please provide valid CSV data.",
                    variant: "destructive"
                  });
                  return;
                }
                
                try {
                  const bookmarksToImport = csvToBookmarks(importCsvText);
                  
                  if (bookmarksToImport.length === 0) {
                    toast({
                      title: "Error",
                      description: "No valid wallet addresses found in the CSV data.",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  // Get existing bookmarks to avoid duplicates
                  const existingAddresses = new Set(bookmarks?.map(b => b.walletAddress.toLowerCase()) || []);
                  const newBookmarks = bookmarksToImport.filter(b => !existingAddresses.has(b.walletAddress.toLowerCase()));
                  
                  if (newBookmarks.length === 0) {
                    toast({
                      title: "No New Wallets",
                      description: "All wallets in the CSV are already in your saved list.",
                    });
                    setIsImportDialogOpen(false);
                    setImportCsvText("");
                    return;
                  }
                  
                  // Process each wallet address
                  let successCount = 0;
                  
                  for (const bookmark of newBookmarks) {
                    const response = await fetch('/api/bookmarks', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        userId,
                        walletAddress: bookmark.walletAddress,
                        label: bookmark.label || null,
                        notes: bookmark.notes || null,
                        isFavorite: bookmark.isFavorite || false
                      }),
                    });
                    
                    if (response.ok) {
                      successCount++;
                    }
                  }
                  
                  if (successCount > 0) {
                    toast({
                      title: "Import Successful",
                      description: `Added ${successCount} new wallet addresses to your saved list.`,
                    });
                    refetch();
                  } else {
                    toast({
                      title: "Import Failed",
                      description: "Failed to import any wallet addresses. Please try again.",
                      variant: "destructive"
                    });
                  }
                  
                  setIsImportDialogOpen(false);
                  setImportCsvText("");
                } catch (error) {
                  console.error("Import error:", error);
                  toast({
                    title: "Error",
                    description: "An unexpected error occurred during import. Please check your CSV format.",
                    variant: "destructive"
                  });
                }
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Import Addresses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Profile;