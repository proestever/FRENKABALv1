import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { UserCredits } from '../../shared/schema';

/**
 * Hook to fetch user credits data
 */
export function useCredits() {
  const { userId, isConnected } = useAuth();

  // Fetch user credits
  const {
    data: credits,
    isLoading,
    error,
    refetch,
  } = useQuery<UserCredits>({
    queryKey: isConnected && userId ? [`/api/users/${userId}/credits`] : ['credits-none'],
    enabled: !!userId && isConnected,
    staleTime: 60 * 1000, // Consider data fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  return {
    credits,
    isLoading,
    error,
    refetch,
  };
}