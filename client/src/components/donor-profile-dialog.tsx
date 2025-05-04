import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { XIcon, Loader2, Globe, Twitter, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UpdateUserProfile } from '@shared/schema';
import { updateUserProfile } from '@/lib/api';

interface DonorProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

const profileSchema = z.object({
  displayName: z.string().max(100, { message: 'Display name must be 100 characters or less' }).optional(),
  website: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
  twitterHandle: z.string().max(50, { message: 'Twitter handle must be 50 characters or less' }).optional(),
  bio: z.string().max(500, { message: 'Bio must be 500 characters or less' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function DonorProfileDialog({ isOpen, onClose, onProfileUpdated }: DonorProfileDialogProps) {
  const { toast } = useToast();
  const { user, refreshUserProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName || '',
      website: user?.website || '',
      twitterHandle: user?.twitterHandle || '',
      bio: user?.bio || '',
    },
  });

  // Update form values when user data changes
  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName || '',
        website: user.website || '',
        twitterHandle: user.twitterHandle || '',
        bio: user.bio || '',
      });
    }
  }, [user, form]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to update your profile',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);

      // Prepare data for API call
      const profileData: Partial<UpdateUserProfile> = {};
      
      // Only include fields that have values
      if (values.displayName) profileData.displayName = values.displayName;
      if (values.website) profileData.website = values.website;
      if (values.twitterHandle) profileData.twitterHandle = values.twitterHandle;
      if (values.bio) profileData.bio = values.bio;

      // Use the API helper to update the profile
      const updatedUser = await updateUserProfile(user.id, profileData);
      
      if (!updatedUser) {
        throw new Error('Failed to update profile');
      }

      // Show success message
      toast({
        title: 'Profile Updated',
        description: 'Your donor profile has been updated successfully',
      });
      
      // Refresh user data in the wallet hook
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      // Notify parent component
      if (onProfileUpdated) {
        onProfileUpdated();
      }

      // Close dialog
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card bg-black/50 border border-white/20 backdrop-blur-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Donor Profile</DialogTitle>
          <DialogDescription>
            Customize how your donations appear on the leaderboard
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="flex items-center gap-2">
              <User className="h-4 w-4 text-white/70" />
              Display Name
            </Label>
            <Input
              id="displayName"
              placeholder="Your name or pseudonym"
              {...form.register('displayName')}
              className="glass-input bg-black/30 border border-white/15"
            />
            {form.formState.errors.displayName && (
              <p className="text-red-500 text-sm">{form.formState.errors.displayName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="website" className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-white/70" />
              Website
            </Label>
            <Input
              id="website"
              placeholder="https://yourwebsite.com"
              {...form.register('website')}
              className="glass-input bg-black/30 border border-white/15"
            />
            {form.formState.errors.website && (
              <p className="text-red-500 text-sm">{form.formState.errors.website.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="twitterHandle" className="flex items-center gap-2">
              <Twitter className="h-4 w-4 text-white/70" />
              X (Twitter) Handle
            </Label>
            <Input
              id="twitterHandle"
              placeholder="@username"
              {...form.register('twitterHandle')}
              className="glass-input bg-black/30 border border-white/15"
            />
            {form.formState.errors.twitterHandle && (
              <p className="text-red-500 text-sm">{form.formState.errors.twitterHandle.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              placeholder="Tell everyone about yourself"
              {...form.register('bio')}
              className="glass-input bg-black/30 border border-white/15 min-h-[100px]"
            />
            {form.formState.errors.bio && (
              <p className="text-red-500 text-sm">{form.formState.errors.bio.message}</p>
            )}
          </div>

          <DialogFooter className="mt-6 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Profile'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}