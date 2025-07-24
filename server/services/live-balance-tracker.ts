/**
 * Live Balance Tracker
 * WebSocket-based real-time balance tracking with event listening
 */

import { ethers, providers, utils, Contract } from 'ethers';
import { EventEmitter } from 'events';

interface TransferEvent {
  wallet: string;
  token: string;
  amount: bigint;
  direction: 'incoming' | 'outgoing';
  blockNumber: number;
  txHash: string;
  from: string;
  to: string;
}

interface BalanceUpdate {
  wallet: string;
  token: string;
  balance: string;
  formattedBalance: number;
  blockNumber: number;
  timestamp: number;
}

// PulseChain WebSocket endpoints
const PULSECHAIN_WSS_ENDPOINTS = [
  'wss://rpc-pulsechain.g4mm4.io',
  'wss://rpc.pulsechain.com',
  'wss://pulsechain-rpc.publicnode.com'
];

class LiveBalanceTracker extends EventEmitter {
  private provider: providers.WebSocketProvider | null = null;
  private trackedWallets: Map<string, Set<string>> = new Map(); // wallet -> tokens
  private providerIndex = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  private eventListeners: Map<string, any> = new Map(); // Store filter references

  constructor() {
    super();
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const wsUrl = PULSECHAIN_WSS_ENDPOINTS[this.providerIndex];
      console.log(`Connecting to WebSocket provider: ${wsUrl}`);
      
      this.provider = new providers.WebSocketProvider(wsUrl);
      
      // Wait for connection - provider connects automatically
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('WebSocket connected successfully');
      
      // Set up connection monitoring
      this.provider.on('error', (error) => {
        console.error('WebSocket error:', error as Error);
        this.handleDisconnect();
      });
      
      this.provider._websocket.on('close', () => {
        console.log('WebSocket connection closed');
        this.handleDisconnect();
      });
      
      // Re-subscribe to all tracked wallets
      await this.resubscribeAll();
      
      this.emit('connected');
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      await this.reconnect();
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnected');
    await this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    this.providerIndex = (this.providerIndex + 1) % PULSECHAIN_WSS_ENDPOINTS.length;
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }

  async trackWallet(walletAddress: string, tokenContracts: string[]): Promise<void> {
    const normalizedWallet = walletAddress.toLowerCase();
    
    // Store tokens for this wallet
    if (!this.trackedWallets.has(normalizedWallet)) {
      this.trackedWallets.set(normalizedWallet, new Set());
    }
    
    const walletTokens = this.trackedWallets.get(normalizedWallet)!;
    tokenContracts.forEach(token => walletTokens.add(token.toLowerCase()));
    
    if (!this.isConnected || !this.provider) {
      console.log('Not connected, will subscribe when connection is established');
      return;
    }
    
    // Subscribe to Transfer events for each token
    for (const tokenAddress of tokenContracts) {
      await this.subscribeToToken(normalizedWallet, tokenAddress.toLowerCase());
    }
  }

  private async subscribeToToken(walletAddress: string, tokenAddress: string): Promise<void> {
    if (!this.provider) return;
    
    const transferEventSignature = utils.id("Transfer(address,address,uint256)");
    
    // Create unique keys for storing filters
    const incomingKey = `${tokenAddress}-${walletAddress}-in`;
    const outgoingKey = `${tokenAddress}-${walletAddress}-out`;
    
    // Remove existing listeners if any
    this.unsubscribeFilter(incomingKey);
    this.unsubscribeFilter(outgoingKey);
    
    try {
      // Filter for incoming transfers
      const incomingFilter = {
        address: tokenAddress,
        topics: [
          transferEventSignature,
          null, // from (any address)
          utils.hexZeroPad(walletAddress, 32) // to (tracked wallet)
        ]
      };
      
      // Filter for outgoing transfers
      const outgoingFilter = {
        address: tokenAddress,
        topics: [
          transferEventSignature,
          utils.hexZeroPad(walletAddress, 32), // from (tracked wallet)
          null // to (any address)
        ]
      };
      
      // Create listeners
      const incomingListener = (log: providers.Log) => {
        this.handleTransfer(log, 'incoming', walletAddress, tokenAddress);
      };
      
      const outgoingListener = (log: providers.Log) => {
        this.handleTransfer(log, 'outgoing', walletAddress, tokenAddress);
      };
      
      // Subscribe to events
      this.provider.on(incomingFilter, incomingListener);
      this.provider.on(outgoingFilter, outgoingListener);
      
      // Store references for cleanup
      this.eventListeners.set(incomingKey, { filter: incomingFilter, listener: incomingListener });
      this.eventListeners.set(outgoingKey, { filter: outgoingFilter, listener: outgoingListener });
      
      console.log(`Subscribed to Transfer events for ${tokenAddress} <-> ${walletAddress}`);
    } catch (error) {
      console.error(`Failed to subscribe to token ${tokenAddress}:`, error);
    }
  }

  private unsubscribeFilter(key: string): void {
    const stored = this.eventListeners.get(key);
    if (stored && this.provider) {
      this.provider.off(stored.filter, stored.listener);
      this.eventListeners.delete(key);
    }
  }

  private async handleTransfer(
    log: providers.Log, 
    direction: 'incoming' | 'outgoing',
    walletAddress: string,
    tokenAddress: string
  ): Promise<void> {
    try {
      // Decode the transfer event
      const transferInterface = new utils.Interface([
        "event Transfer(address indexed from, address indexed to, uint256 value)"
      ]);
      
      const decoded = transferInterface.parseLog({
        topics: log.topics,
        data: log.data
      });
      
      if (!decoded) return;
      
      const event: TransferEvent = {
        wallet: walletAddress,
        token: tokenAddress,
        amount: decoded.args.value,
        direction,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        from: decoded.args.from.toLowerCase(),
        to: decoded.args.to.toLowerCase()
      };
      
      console.log(`Transfer detected: ${direction} ${utils.formatUnits(event.amount, 18)} tokens for ${walletAddress}`);
      
      // Emit the transfer event
      this.emit('transfer', event);
      
      // Fetch and emit updated balance
      await this.fetchAndEmitBalance(walletAddress, tokenAddress, log.blockNumber);
    } catch (error) {
      console.error('Error handling transfer:', error);
    }
  }

  private async fetchAndEmitBalance(
    walletAddress: string, 
    tokenAddress: string,
    blockNumber: number
  ): Promise<void> {
    if (!this.provider) return;
    
    try {
      // Create token contract instance
      const tokenContract = new Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        this.provider
      );
      
      // Fetch balance and decimals
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals()
      ]);
      
      const balanceUpdate: BalanceUpdate = {
        wallet: walletAddress,
        token: tokenAddress,
        balance: balance.toString(),
        formattedBalance: parseFloat(utils.formatUnits(balance, decimals)),
        blockNumber,
        timestamp: Date.now()
      };
      
      this.emit('balanceUpdate', balanceUpdate);
    } catch (error) {
      console.error(`Failed to fetch balance for ${walletAddress}/${tokenAddress}:`, error);
    }
  }

  private async resubscribeAll(): Promise<void> {
    console.log('Re-subscribing to all tracked wallets...');
    
    for (const [wallet, tokens] of Array.from(this.trackedWallets)) {
      for (const token of Array.from(tokens)) {
        await this.subscribeToToken(wallet, token);
      }
    }
  }

  async untrackWallet(walletAddress: string): Promise<void> {
    const normalizedWallet = walletAddress.toLowerCase();
    const tokens = this.trackedWallets.get(normalizedWallet);
    
    if (!tokens) return;
    
    // Unsubscribe from all tokens for this wallet
    for (const token of Array.from(tokens)) {
      const incomingKey = `${token}-${normalizedWallet}-in`;
      const outgoingKey = `${token}-${normalizedWallet}-out`;
      this.unsubscribeFilter(incomingKey);
      this.unsubscribeFilter(outgoingKey);
    }
    
    this.trackedWallets.delete(normalizedWallet);
    console.log(`Untracked wallet: ${walletAddress}`);
  }

  async fetchInitialBalance(walletAddress: string, tokenAddress: string): Promise<BalanceUpdate | null> {
    if (!this.provider) return null;
    
    try {
      const tokenContract = new Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        this.provider
      );
      
      const [balance, decimals, blockNumber] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        this.provider.getBlockNumber()
      ]);
      
      return {
        wallet: walletAddress.toLowerCase(),
        token: tokenAddress.toLowerCase(),
        balance: balance.toString(),
        formattedBalance: parseFloat(utils.formatUnits(balance, decimals)),
        blockNumber,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to fetch initial balance for ${walletAddress}/${tokenAddress}:`, error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.provider !== null;
  }

  async close(): Promise<void> {
    if (this.provider) {
      // Unsubscribe all listeners
      for (const key of Array.from(this.eventListeners.keys())) {
        this.unsubscribeFilter(key);
      }
      
      await this.provider.destroy();
      this.provider = null;
    }
    
    this.trackedWallets.clear();
    this.isConnected = false;
  }
}

// Create singleton instance
export const liveBalanceTracker = new LiveBalanceTracker();

export type { TransferEvent, BalanceUpdate };