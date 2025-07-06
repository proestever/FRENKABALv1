import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useToast } from '@/hooks/use-toast';
import { getUserFromWallet, getUserProfile } from '@/lib/api';
import { User } from '@shared/schema';

interface UseWalletReturn {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  userId: number | null;
  user: User | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isPulseChain: boolean;
  refreshUserProfile: () => Promise<User | null>;
}

export function useWallet(): UseWalletReturn {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

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
            // We found the saved address in the available accounts
            // But we need to verify ownership with a signature
            console.log("Found saved wallet connection, requesting signature to verify ownership:", savedAddress);
            
            try {
              // Request signature to verify wallet ownership
              const signer = provider.getSigner(savedAddress);
              const timestamp = Date.now();
              const message = `Sign this message to verify you own this wallet.\n\nTimestamp: ${timestamp}`;
              
              // Show toast about signature requirement
              toast({
                title: "Wallet Verification Required",
                description: "Please sign the message to verify you still own this wallet.",
              });
              
              const signature = await signer.signMessage(message);
              console.log("Signature received for reconnection");
              
              // Now verify with the backend
              const userId = await getUserFromWallet(savedAddress, {
                signature: signature,
                message: message,
                timestamp: timestamp,
                walletAddress: savedAddress
              });
              
              if (userId) {
                // Verification successful, restore connection
                setAccount(savedAddress);
                setUserId(userId);
                localStorage.setItem('userId', String(userId));
                
                // Update timestamp
                localStorage.setItem('lastLoginTimestamp', Date.now().toString());
                localStorage.setItem('walletSignature', signature);
                localStorage.setItem('signatureTimestamp', timestamp.toString());
                
                // Get chain ID
                const network = await provider.getNetwork();
                setChainId(network.chainId);
                
                console.log("Wallet connection restored after verification:", savedAddress);
              } else {
                // Verification failed, clear localStorage
                console.log("Wallet verification failed, clearing stored connection");
                localStorage.removeItem('walletConnected');
                localStorage.removeItem('walletAddress');
                localStorage.removeItem('userId');
                localStorage.removeItem('lastLoginTimestamp');
                localStorage.removeItem('walletSignature');
                localStorage.removeItem('signatureTimestamp');
              }
            } catch (error) {
              console.log("User rejected signature or error occurred:", error);
              // Clear localStorage if signature is rejected
              localStorage.removeItem('walletConnected');
              localStorage.removeItem('walletAddress');
              localStorage.removeItem('userId');
              localStorage.removeItem('lastLoginTimestamp');
              localStorage.removeItem('walletSignature');
              localStorage.removeItem('signatureTimestamp');
              }
          } else if (accounts.length > 0) {
            // The saved address is not available but other accounts are
            // This likely means the user switched wallets
            console.log(`Saved wallet ${savedAddress} not found, but found ${accounts[0]}`);
            
            // Clear the old connection data
            localStorage.removeItem('walletConnected');
            localStorage.removeItem('walletAddress');
            localStorage.removeItem('userId');
            localStorage.removeItem('lastLoginTimestamp');
            localStorage.removeItem('walletSignature');
            localStorage.removeItem('signatureTimestamp');
            
            // Don't automatically connect to the new wallet
            // User must explicitly connect with the new wallet
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
      } 
      // If no localStorage data, do not automatically connect
      // User must explicitly connect with signature verification
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
    chainId,
    userId,
    user,
    connect,
    disconnect,
    isConnecting,
    isPulseChain,
    refreshUserProfile,
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