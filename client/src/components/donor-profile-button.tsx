import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { User, UserCog } from 'lucide-react';
import { DonorProfileDialog } from '@/components/donor-profile-dialog';
import { useAuth } from '@/providers/auth-provider';

export function DonorProfileButton() {
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const { isConnected, user } = useAuth();

  // Function to refresh data after profile update
  const handleProfileUpdated = () => {
    console.log('Profile updated successfully');
  };

  if (!isConnected) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-2 glass-button"
        onClick={() => setIsProfileDialogOpen(true)}
      >
        {user?.displayName ? (
          <>
            <User className="h-4 w-4" />
            {user.displayName}
          </>
        ) : (
          <>
            <UserCog className="h-4 w-4" />
            Edit Profile
          </>
        )}
      </Button>

      <DonorProfileDialog
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    </>
  );
}