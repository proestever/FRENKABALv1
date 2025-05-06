// Global type declarations

// Extend the Window interface for Ethereum providers
interface Window {
  ethereum?: {
    isMetaMask?: boolean;
    isConnected?: () => boolean;
    request: (request: { method: string; params?: any[] }) => Promise<any>;
    on: (event: string, listener: (...args: any[]) => void) => void;
    removeListener: (event: string, listener: (...args: any[]) => void) => void;
    selectedAddress?: string;
    chainId?: string;
    networkVersion?: string;
    [key: string]: any;
  };
}