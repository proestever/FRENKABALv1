// Re-export the useAuth hook from the auth provider
import { useAuth as useAuthFromProvider } from '@/providers/auth-provider';

export const useAuth = useAuthFromProvider;