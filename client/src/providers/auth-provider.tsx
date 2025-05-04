import { ReactNode, createContext, useContext } from 'react';
import { useWallet } from '@/hooks/use-wallet';

// Define the shape of the context
interface AuthContextType {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  userId: number | null;
  user: any | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isPulseChain: boolean;
  refreshUserProfile: () => Promise<any | null>;
}

// Create the context with default values to prevent null checks
const AuthContext = createContext<AuthContextType>({
  isConnected: false,
  account: null,
  chainId: null,
  userId: null,
  user: null,
  // These will be overridden by the actual implementation
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
  isPulseChain: false,
  refreshUserProfile: async () => null,
});

// Create a provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const walletAuth = useWallet();
  
  return (
    <AuthContext.Provider value={walletAuth}>
      {children}
    </AuthContext.Provider>
  );
}

// Create a custom hook for accessing the auth context
export function useAuth() {
  return useContext(AuthContext);
}