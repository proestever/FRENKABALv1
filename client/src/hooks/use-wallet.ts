import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useToast } from '@/hooks/use-toast';
import { getUserFromWallet } from '@/lib/api';

interface UseWalletReturn {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  userId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isPulseChain: boolean;
}

export function useWallet(): UseWalletReturn {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
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
      
      if (walletConnected && savedAddress && window.ethereum) {
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
            
            // Get or create user ID for this wallet
            const user = await getUserFromWallet(savedAddress);
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
    if (typeof window === 'undefined' || !window.ethereum) return;
    
    const ethereum = window.ethereum;
    
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected
        setAccount(null);
        setChainId(null);
        
        // Clear localStorage
        localStorage.removeItem('walletConnected');
        localStorage.removeItem('walletAddress');
      } else {
        setAccount(accounts[0]);
        
        // Update localStorage
        localStorage.setItem('walletConnected', 'true');
        localStorage.setItem('walletAddress', accounts[0]);
      }
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
  }, [toast, PULSE_CHAIN_ID]);

  // Connect to wallet with signature verification
  const connect = useCallback(async () => {
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
      if (!window.ethereum) {
        toast({
          title: "Wallet not found",
          description: "Please install MetaMask or another compatible wallet",
          variant: "destructive",
        });
        clearTimeout(connectionTimeout);
        setIsConnecting(false);
        return;
      }
      
      // Create a fresh provider for each connection attempt
      const provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
      
      console.log("Requesting accounts from wallet...");
      
      // Request wallet connection
      const accounts = await provider.send("eth_requestAccounts", []);
      
      if (accounts.length > 0) {
        const address = accounts[0];
        console.log("Wallet connected:", address);
        
        // Create a welcoming signature message with features
        const message = `🌟 Welcome to FrenKabal! 🌟\n
🔑 Wallet Authentication
This signature proves you own this wallet address: ${address}

🔒 Security Note
This signature will not trigger any blockchain transaction or cost any gas fees.

✨ Unlock FrenKabal Premium Features ✨
• Real-time wallet tracking and portfolio monitoring
• Advanced token sniping tools and alerts
• Deep dive transaction history analysis
• Cross-chain asset visualization
• Custom price alerts and notifications
• And much more coming soon!

Become part of the FrenKabal community today.
Timestamp: ${new Date().toISOString()}`;
        
        try {
          console.log("Requesting signature...");
          // Request signature to verify wallet ownership
          const signer = provider.getSigner();
          await signer.signMessage(message);
          
          console.log("Signature verified successfully");
          
          // Set the account if signature was successful
          setAccount(address);
          
          // Store wallet info in localStorage for persistence
          localStorage.setItem('walletConnected', 'true');
          localStorage.setItem('walletAddress', address);
          
          // Get network
          const network = await provider.getNetwork();
          setChainId(network.chainId);
          
          console.log("Connected to network:", network.chainId);
          
          // Create or get user ID for this wallet
          const user = await getUserFromWallet(address);
          if (user) {
            setUserId(user);
            localStorage.setItem('userId', String(user));
          }
          
          // Check if on PulseChain
          if (network.chainId !== PULSE_CHAIN_ID) {
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
          
          toast({
            title: "Welcome to FrenKabal! 🌟",
            description: `Account ${address.substring(0, 6)}...${address.substring(38)} successfully connected and verified. Enjoy all premium features!`,
          });
        } catch (signError) {
          console.error("Error signing verification message:", signError);
          toast({
            title: "Signature Required",
            description: "Please sign the message to verify wallet ownership",
            variant: "destructive",
          });
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
    
    // Clear localStorage data
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('userId');
    
    toast({
      title: "Wallet Disconnected",
      description: "Successfully disconnected wallet",
    });
  }, [toast]);

  return {
    isConnected: !!account,
    account,
    chainId,
    userId,
    connect,
    disconnect,
    isConnecting,
    isPulseChain,
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
    };
  }
}