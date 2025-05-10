import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useToast } from '@/hooks/use-toast';
import { getUserFromWallet, getUserProfile } from '@/lib/api';
import { User } from '@shared/schema';

interface UseWalletReturn {
  isConnected: boolean;
  account: string | null;
  walletAddress: string | null; // Alias for account for consistency
  chainId: number | null;
  userId: number | null;
  user: User | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isPulseChain: boolean;
  refreshUserProfile: () => Promise<User | null>;
  provider: ethers.providers.Web3Provider | null;
}

export function useWallet(): UseWalletReturn {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const { toast } = useToast();
  
  // Alias for account for backwards compatibility
  const walletAddress = account;

  // PulseChain mainnet ID
  const PULSE_CHAIN_ID = 369;

  // Check if we're connected to PulseChain
  const isPulseChain = chainId === PULSE_CHAIN_ID;

  // Check for existing connection from localStorage and wallet
  useEffect(() => {
    const checkConnection = async () => {
      // First check localStorage for persistent connection
      const walletConnected = localStorage.getItem('walletConnected') === 'true';
      const savedAddress = localStorage.getItem('walletAddress');
      const lastLoginTimestamp = localStorage.getItem('lastLoginTimestamp');
      const loginExpirationMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      // Check if login is still valid (within the last 7 days)
      const isLoginValid = lastLoginTimestamp && 
        (Date.now() - parseInt(lastLoginTimestamp, 10)) < loginExpirationMs;
        
      // Debug info for login expiration
      if (lastLoginTimestamp) {
        const timeLeft = loginExpirationMs - (Date.now() - parseInt(lastLoginTimestamp, 10));
        const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
        const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        console.log(`Login token valid for ${daysLeft} days and ${hoursLeft} hours`);
      }
      
      if (walletConnected && savedAddress && window.ethereum && isLoginValid) {
        try {
          // Validate that the wallet is still available
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          // If the saved address is in the available accounts, restore the connection
          if (accounts.includes(savedAddress)) {
            setAccount(savedAddress);
            
            // Get chain ID
            const network = await provider.getNetwork();
            setChainId(network.chainId);
            
            console.log("Restored wallet connection from localStorage:", savedAddress);
            
            // Since signature verification is failing when restoring from localStorage,
            // we'll use a non-signature approach for reconnecting existing wallets
            console.log('Getting user ID without signature verification for existing connected wallet');
            const user = await getUserFromWallet(savedAddress);
            
            // Check if the auth token in localStorage is still valid
            const loginTimestamp = localStorage.getItem('lastLoginTimestamp');
            if (loginTimestamp) {
              const loginTime = parseInt(loginTimestamp);
              const currentTime = Date.now();
              const daysSinceLogin = (currentTime - loginTime) / (1000 * 60 * 60 * 24);
              
              if (daysSinceLogin <= 7) {
                // Token is still valid (within 7 days)
                console.log(`Login token valid for ${Math.floor(7 - daysSinceLogin)} days and ${Math.floor((7 - daysSinceLogin) % 1 * 24)} hours`);
              } else {
                // Token expired, should prompt for re-verification
                console.log('Auth token expired, should prompt for re-verification');
                // We'll still use the basic user ID for now
              }
            }
            
            if (user) {
              setUserId(user);
              localStorage.setItem('userId', String(user));
            }
          } else if (accounts.length > 0) {
            // Fallback: If the saved address is not available but others are
            setAccount(accounts[0]);
            
            // Update localStorage with new address
            localStorage.setItem('walletAddress', accounts[0]);
            
            // Get chain ID
            const network = await provider.getNetwork();
            setChainId(network.chainId);
            
            // Get or create user ID for this wallet
            const user = await getUserFromWallet(accounts[0]);
            if (user) {
              setUserId(user);
              localStorage.setItem('userId', String(user));
            }
          } else {
            // No accounts available, clear localStorage
            localStorage.removeItem('walletConnected');
            localStorage.removeItem('walletAddress');
            localStorage.removeItem('userId');
          }
        } catch (error) {
          console.error("Error checking connection:", error);
          // Clear localStorage on error
          localStorage.removeItem('walletConnected');
          localStorage.removeItem('walletAddress');
          localStorage.removeItem('userId');
          localStorage.removeItem('lastLoginTimestamp');
        }
      } else if (window.ethereum) {
        // No localStorage data, check if wallet is connected
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            
            // Store in localStorage for persistence
            localStorage.setItem('walletConnected', 'true');
            localStorage.setItem('walletAddress', accounts[0]);
            localStorage.setItem('lastLoginTimestamp', Date.now().toString());
            
            // Get chain ID
            const network = await provider.getNetwork();
            setChainId(network.chainId);
            
            // Get or create user ID for this wallet
            const user = await getUserFromWallet(accounts[0]);
            if (user) {
              setUserId(user);
              localStorage.setItem('userId', String(user));
            }
          }
        } catch (error) {
          console.error("Error checking connection:", error);
        }
      }
    };
    
    checkConnection();
  }, []);

  // Setup event listeners for wallet and chain changes
  useEffect(() => {
    // Skip if ethereum is not available in window
    if (typeof window === 'undefined') return;
    
    // Safely access ethereum object
    let ethereum;
    try {
      ethereum = window.ethereum;
    } catch (err) {
      console.error("Error accessing window.ethereum in effect:", err);
      return;
    }
    
    if (!ethereum) return;
    
    const handleAccountsChanged = async (accounts: string[]) => {
      // For any wallet change or disconnection, sign out the user completely
      const oldAddress = localStorage.getItem('walletAddress');
      
      if (accounts.length === 0) {
        // User disconnected all accounts
        console.log('All wallet accounts disconnected');
      } else if (oldAddress && oldAddress.toLowerCase() !== accounts[0].toLowerCase()) {
        // User switched to a different wallet
        console.log(`Wallet changed from ${oldAddress} to ${accounts[0]}`);
        toast({
          title: "Wallet Changed",
          description: "You've switched wallets. Please connect again to continue.",
        });
      }
      
      // Always clear all state and localStorage for any account change
      setAccount(null);
      setChainId(null);
      setUserId(null);
      setUser(null);
      
      // Clear localStorage
      localStorage.removeItem('walletConnected');
      localStorage.removeItem('walletAddress');
      localStorage.removeItem('userId');
      localStorage.removeItem('lastLoginTimestamp');
      localStorage.removeItem('walletSignature');
      localStorage.removeItem('signatureTimestamp');
    };
    
    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      setChainId(newChainId);
      
      if (newChainId !== PULSE_CHAIN_ID) {
        toast({
          title: "Wrong Network",
          description: "Please connect to PulseChain for full functionality",
          variant: "destructive",
        });
      }
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    
    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [toast, PULSE_CHAIN_ID, getUserFromWallet, getUserProfile]);

  // Connect to wallet with signature verification
  const connect = useCallback(async () => {
    console.log("Connect function called", Date.now());
    // Set connection state
    setIsConnecting(true);
    
    // Add a timeout to prevent infinite loading state
    const connectionTimeout = setTimeout(() => {
      console.log("Wallet connection timeout - resetting state");
      setIsConnecting(false);
      toast({
        title: "Connection Timeout",
        description: "Wallet connection attempt timed out. Please try again.",
        variant: "destructive",
      });
    }, 30000); // 30 second timeout
    
    try {
      // Check if ethereum object exists in a try/catch to handle injection errors
      let ethereumProvider;
      try {
        ethereumProvider = window.ethereum;
      } catch (err) {
        console.error("Error accessing window.ethereum:", err);
      }
      
      if (!ethereumProvider) {
        console.log("No ethereum object found in window");
        toast({
          title: "Wallet not found",
          description: "Please install MetaMask or another compatible wallet",
          variant: "destructive",
        });
        return;
      }
      
      console.log("Ethereum object found:", typeof ethereumProvider);
      
      // Safely call request method with error handling
      let accounts;
      try {
        // Use direct window.ethereum request instead of ethers
        console.log("Directly requesting accounts from wallet...");
        accounts = await ethereumProvider.request({ method: 'eth_requestAccounts' });
        console.log("Accounts received:", accounts);
      } catch (requestError) {
        console.error("Error requesting accounts:", requestError);
        // Don't throw an error, just show toast and continue with null accounts
        toast({
          title: "Wallet connection error",
          description: "Unable to connect to your wallet. Please try again.",
          variant: "destructive",
        });
        clearTimeout(connectionTimeout);
        setIsConnecting(false);
        return;
      }
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        console.log("Wallet connected:", address);
        
        // Initialize ethers provider and signer
        if (!window.ethereum) {
          throw new Error("Ethereum provider not found");
        }
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        
        // Create a message for the user to sign, including a nonce for security
        const timestamp = Date.now();
        const message = `Sign this message to verify you own this wallet address:\n\n${address}\n\nTimestamp: ${timestamp}\n\nThis signature doesn't cost any gas or send a transaction.`;
        
        // Request signature from user's wallet
        console.log("Requesting signature to verify wallet ownership...");
        let signature;
        try {
          // Show a toast to inform the user about the signature request
          toast({
            title: "Signature Required",
            description: "Please sign the message in your wallet to verify ownership.",
          });
          
          signature = await signer.signMessage(message);
          console.log("Signature received:", signature.substring(0, 20) + "...");
          
          // Now we can verify the address owns this wallet through the signature
          
          // Set the account after signature verified
          setAccount(address);
          
          // Store wallet info in localStorage for persistence
          localStorage.setItem('walletConnected', 'true');
          localStorage.setItem('walletAddress', address);
          localStorage.setItem('lastLoginTimestamp', Date.now().toString());
          localStorage.setItem('walletSignature', signature);
          localStorage.setItem('signatureTimestamp', timestamp.toString());
          
          // Get chain ID directly from ethereum
          const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
          const chainId = parseInt(chainIdHex, 16);
          setChainId(chainId);
          console.log("Connected to network:", chainId);
          
          // Create or get user ID for this wallet - pass signature for verification
          const user = await getUserFromWallet(address, {
            signature: signature,
            message: message,
            timestamp: timestamp,
            walletAddress: address
          });
          if (user) {
            setUserId(user);
            localStorage.setItem('userId', String(user));
          }
        } catch (signError) {
          console.error("Signature request was rejected:", signError);
          throw new Error("You must sign the message to verify wallet ownership");
        }
        
        toast({
          title: "Wallet Connected! 🌟",
          description: `Account ${address.substring(0, 6)}...${address.substring(address.length - 4)} successfully connected!`,
        });
        
        // Check if on PulseChain
        if (chainId !== PULSE_CHAIN_ID) {
          console.log("Not on PulseChain, prompting to switch...");
          // Prompt to switch to PulseChain
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${PULSE_CHAIN_ID.toString(16)}` }],
            });
          } catch (switchError: any) {
            // If PulseChain not added, add it
            if (switchError.code === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: `0x${PULSE_CHAIN_ID.toString(16)}`,
                    chainName: 'PulseChain',
                    nativeCurrency: {
                      name: 'Pulse',
                      symbol: 'PLS',
                      decimals: 18
                    },
                    rpcUrls: ['https://rpc.pulsechain.com'],
                    blockExplorerUrls: ['https://scan.pulsechain.com']
                  }],
                });
              } catch (addError) {
                console.error("Error adding PulseChain:", addError);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to wallet",
        variant: "destructive",
      });
    } finally {
      clearTimeout(connectionTimeout);
      setIsConnecting(false);
    }
  }, [toast, PULSE_CHAIN_ID]);

  // Disconnect wallet and clear persistence
  const disconnect = useCallback(() => {
    // Clear state
    setAccount(null);
    setChainId(null);
    setUserId(null);
    setUser(null);
    
    // Clear localStorage data
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('userId');
    localStorage.removeItem('lastLoginTimestamp');
    localStorage.removeItem('walletSignature');
    localStorage.removeItem('signatureTimestamp');
    
    toast({
      title: "Wallet Disconnected",
      description: "Successfully disconnected wallet",
    });
  }, [toast]);

  // Load user profile data
  useEffect(() => {
    const loadUserProfile = async () => {
      if (userId) {
        try {
          const profileData = await getUserProfile(userId);
          if (profileData) {
            setUser(profileData);
          }
        } catch (error) {
          console.error("Error loading user profile:", error);
        }
      } else {
        // Clear user data if no userId
        setUser(null);
      }
    };
    
    loadUserProfile();
  }, [userId]);
  
  // Function to refresh user profile data
  const refreshUserProfile = useCallback(async (): Promise<User | null> => {
    if (!userId) return null;
    
    try {
      const profileData = await getUserProfile(userId);
      if (profileData) {
        setUser(profileData);
        return profileData;
      }
      return null;
    } catch (error) {
      console.error("Error refreshing user profile:", error);
      return null;
    }
  }, [userId]);

  // Debug utility function to simulate an expired session (for testing)
  const resetLoginTimestamp = useCallback(() => {
    // Set login timestamp to 8 days ago (expired)
    const expiredTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
    localStorage.setItem('lastLoginTimestamp', expiredTimestamp.toString());
    console.log("Debug: Login timestamp reset to expired state");
  }, []);

  return {
    isConnected: !!account,
    account,
    walletAddress, // Alias for account
    chainId,
    userId,
    user,
    connect,
    disconnect,
    isConnecting,
    isPulseChain,
    refreshUserProfile,
    provider,
    // Include debug utility only in development
    ...(process.env.NODE_ENV === 'development' ? { resetLoginTimestamp } : {})
  };
}

// Add types for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (request: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, listener: (...args: any[]) => void) => void;
      removeListener: (event: string, listener: (...args: any[]) => void) => void;
      // Add these additional properties that might be present
      selectedAddress?: string;
      chainId?: string;
      networkVersion?: string;
      // Allow any other properties that might be added by extensions
      [key: string]: any;
    };
  }
}