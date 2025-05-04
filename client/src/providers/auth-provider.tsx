import { ReactNode, createContext, useContext } from 'react';
import { useWallet } from '@/hooks/use-wallet';

// Create the context with the same shape as useWallet return value
const AuthContext = createContext<ReturnType<typeof useWallet> | null>(null);

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
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}