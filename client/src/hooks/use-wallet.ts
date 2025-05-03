import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useToast } from '@/hooks/use-toast';

interface UseWalletReturn {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isPulseChain: boolean;
}

export function useWallet(): UseWalletReturn {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  // PulseChain mainnet ID
  const PULSE_CHAIN_ID = 369;

  // Check if we're connected to PulseChain
  const isPulseChain = chainId === PULSE_CHAIN_ID;

  // Check for existing connection
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          // Check if already connected
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            
            // Get chain ID
            const network = await provider.getNetwork();
            setChainId(network.chainId);
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
      } else {
        setAccount(accounts[0]);
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

  // Connect to wallet
  const connect = useCallback(async () => {
    setIsConnecting(true);
    
    try {
      if (!window.ethereum) {
        toast({
          title: "Wallet not found",
          description: "Please install MetaMask or another compatible wallet",
          variant: "destructive",
        });
        return;
      }
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        
        // Get network
        const network = await provider.getNetwork();
        setChainId(network.chainId);
        
        // Check if on PulseChain
        if (network.chainId !== PULSE_CHAIN_ID) {
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
          title: "Wallet Connected",
          description: `Connected to ${accounts[0].substring(0, 6)}...${accounts[0].substring(38)}`,
        });
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to wallet",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast, PULSE_CHAIN_ID]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    toast({
      title: "Wallet Disconnected",
      description: "Successfully disconnected wallet",
    });
  }, [toast]);

  return {
    isConnected: !!account,
    account,
    chainId,
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