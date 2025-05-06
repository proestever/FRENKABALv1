// This file creates a shim for ethereum integration
// to avoid the console errors about "Cannot set property ethereum of #<Window> which has only a getter"

// Define a minimal Ethereum provider interface
interface MinimalEthereumProvider {
  isMetaMask?: boolean;
  isConnected: () => boolean;
  request: (request: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, listener: (...args: any[]) => void) => void;
  removeListener: (event: string, listener: (...args: any[]) => void) => void;
  selectedAddress?: string;
  chainId?: string;
  networkVersion?: string;
  autoRefreshOnNetworkChange?: boolean;
  _state?: {
    accounts: string[];
    isConnected: boolean;
    isUnlocked: boolean;
    initialized: boolean;
  };
  [key: string]: any;
}

// Extend the Window interface to include our custom properties
declare global {
  interface Window {
    _dummyEthereum?: MinimalEthereumProvider;
    _dummyEthereumShim?: MinimalEthereumProvider;
    ethereum?: MinimalEthereumProvider;
  }
}

// Check if window is defined (to avoid SSR issues)
if (typeof window !== 'undefined') {
  try {
    // Only define our shim if ethereum is not already defined
    // This avoids conflicts with existing wallets
    if (!window.ethereum) {
      // Create a dummy ethereum object that does nothing but doesn't crash
      const dummyEthereum: MinimalEthereumProvider = {
        isMetaMask: false,
        isConnected: () => false,
        request: async () => {
          throw new Error('No Ethereum provider available');
        },
        on: () => {},
        removeListener: () => {},
        autoRefreshOnNetworkChange: false,
        chainId: undefined,
        selectedAddress: undefined,
        networkVersion: undefined,
        _state: {
          accounts: [],
          isConnected: false,
          isUnlocked: false,
          initialized: false,
        }
      };
      
      // Try to create a property descriptor that won't conflict with existing wallets
      // This way we provide a fallback but don't override legitimate providers
      try {
        Object.defineProperty(window, '_dummyEthereumShim', {
          value: dummyEthereum,
          writable: false,
          configurable: false
        });
        
        // Only if ethereum isn't already defined, provide our dummy interface
        if (!window.ethereum) {
          Object.defineProperty(window, 'ethereum', {
            get: function() {
              // Return the real ethereum provider if it exists, otherwise our dummy
              return window._dummyEthereum || window._dummyEthereumShim;
            },
            configurable: true
          });
        }
      } catch (e) {
        // Silent fail - the property is likely locked by browser security
        // This is fine as it means there's probably an actual wallet provider
      }
    }
  } catch (e) {
    // Silently catch any errors to avoid breaking the app
    console.debug('Ethereum shim setup failed (this is usually not a problem)');
  }
}

// Make sure TypeScript exports a module
export {};