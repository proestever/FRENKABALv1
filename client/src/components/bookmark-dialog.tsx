import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addBookmark, updateBookmark, deleteBookmark } from '@/lib/api';
import { Bookmark } from '@shared/schema';
import { Loader2, Trash2 } from 'lucide-react';

interface BookmarkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  userId: number | null;
  existingBookmark: Bookmark | null;
  onBookmarkCreated?: (bookmark: Bookmark) => void;
  onBookmarkUpdated?: (bookmark: Bookmark) => void;
  onBookmarkDeleted?: () => void;
}

export function BookmarkDialog({
  isOpen,
  onClose,
  walletAddress,
  userId,
  existingBookmark,
  onBookmarkCreated,
  onBookmarkUpdated,
  onBookmarkDeleted
}: BookmarkDialogProps) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  
  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      // If we're editing an existing bookmark, populate the form
      if (existingBookmark) {
        setLabel(existingBookmark.label || '');
        setNotes(existingBookmark.notes || '');
      } else {
        // Default label for new bookmarks
        setLabel(walletAddress ? `Wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}` : '');
        setNotes('');
      }
    }
  }, [isOpen, existingBookmark, walletAddress]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      toast({
        title: "Login Required",
        description: "Please connect your wallet to save bookmarks",
        variant: "destructive"
      });
      return;
    }
    
    if (!label.trim()) {
      toast({
        title: "Label Required",
        description: "Please provide a label for this bookmark",
        variant: "destructive"
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      if (existingBookmark) {
        // Update existing bookmark
        const updatedBookmark = await updateBookmark(existingBookmark.id, label, notes);
        
        if (updatedBookmark) {
          toast({
            title: "Bookmark Updated",
            description: "Your bookmark has been updated successfully"
          });
          
          if (onBookmarkUpdated) {
            onBookmarkUpdated(updatedBookmark);
          }
          
          onClose();
        }
      } else {
        // Create new bookmark
        const newBookmark = await addBookmark(userId, walletAddress, label, notes);
        
        if (newBookmark) {
          toast({
            title: "Bookmark Added",
            description: "Wallet address has been bookmarked successfully"
          });
          
          if (onBookmarkCreated) {
            onBookmarkCreated(newBookmark);
          }
          
          onClose();
        }
      }
    } catch (error) {
      console.error('Error saving bookmark:', error);
      toast({
        title: "Error",
        description: "Failed to save bookmark. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDelete = async () => {
    if (!existingBookmark) return;
    
    setIsDeleting(true);
    
    try {
      const success = await deleteBookmark(existingBookmark.id);
      
      if (success) {
        toast({
          title: "Bookmark Deleted",
          description: "Your bookmark has been deleted successfully"
        });
        
        if (onBookmarkDeleted) {
          onBookmarkDeleted();
        }
        
        onClose();
      }
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      toast({
        title: "Error",
        description: "Failed to delete bookmark. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] glass-card border-white/15">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">{existingBookmark ? 'Edit Bookmark' : 'Save Bookmark'}</DialogTitle>
            <DialogDescription>
              {existingBookmark 
                ? 'Update the details for this bookmarked wallet' 
                : 'Save this wallet address to your bookmarks for easy access later'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="address" className="text-white">Wallet Address</Label>
              <Input 
                id="address" 
                value={walletAddress} 
                disabled 
                className="glass-card border-white/15 text-white/70"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="label" className="text-white">Label</Label>
              <Input 
                id="label" 
                value={label} 
                onChange={(e) => setLabel(e.target.value)} 
                placeholder="Enter a name for this wallet"
                className="glass-card border-white/15 text-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-white">Notes (Optional)</Label>
              <Textarea 
                id="notes" 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Add any additional notes about this wallet"
                className="glass-card border-white/15 text-white"
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {existingBookmark && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting || isProcessing}
                className="mr-auto w-full sm:w-auto"
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete
              </Button>
            )}
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isProcessing || isDeleting}
              className="glass-card border-white/15 w-full sm:w-auto"
            >
              Cancel
            </Button>
            
            <Button 
              type="submit" 
              disabled={isProcessing || isDeleting}
              className="gradient-button w-full sm:w-auto"
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingBookmark ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}