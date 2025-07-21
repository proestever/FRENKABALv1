import { ethers } from 'ethers';
import { ProcessedToken } from '../types';

// RPC endpoints for PulseChain
const RPC_ENDPOINTS = [
  'https://rpc-pulsechain.g4mm4.io',
  'https://rpc.pulsechain.com',
  'https://pulsechain.publicnode.com',
  'https://rpc.pulsechain.one'
];

// Constants
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ERC20 ABI for token interactions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)'
];

// Native tokens that are always included
const NATIVE_TOKENS = new Set([
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', // HEX
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab', // PLSX
  '0x2fa878ab3cd87626e79341a076b4bf86bdd0445b', // INC
  WPLS_ADDRESS.toLowerCase()
]);

interface TokenInfo {
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
  name: string;
}

export class ClientBlockchainService {
  private providers: ethers.providers.JsonRpcProvider[] = [];
  private currentProviderIndex = 0;
  private tokenCache = new Map<string, TokenInfo>();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize multiple providers for redundancy
    this.providers = RPC_ENDPOINTS.map(url => new ethers.providers.JsonRpcProvider({
      url,
      timeout: 10000, // 10 second timeout
      allowGzip: true
    }));
  }

  private getProvider(): ethers.providers.JsonRpcProvider {
    // Round-robin through providers
    const provider = this.providers[this.currentProviderIndex];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    return provider;
  }

  /**
   * Fetch wallet balances directly from blockchain
   */
  async fetchWalletTokens(
    walletAddress: string,
    onProgress?: (message: string, progress: number) => void
  ): Promise<ProcessedToken[]> {
    try {
      const processedTokens: ProcessedToken[] = [];
      
      if (onProgress) onProgress('Connecting to blockchain...', 5);
      
      // Step 1: Get native PLS balance
      const provider = this.getProvider();
      const plsBalance = await provider.getBalance(walletAddress);
      const plsBalanceFormatted = parseFloat(ethers.utils.formatUnits(plsBalance, PLS_DECIMALS));
      
      if (plsBalanceFormatted > 0) {
        processedTokens.push({
          address: PLS_TOKEN_ADDRESS,
          symbol: 'PLS',
          name: 'PulseChain',
          decimals: PLS_DECIMALS,
          balance: plsBalance.toString(),
          balanceFormatted: plsBalanceFormatted,
          price: 0, // Will be fetched by price service
          value: 0,
          logo: '', // Will be fetched by logo service
          isNative: true,
          verified: true
        });
      }
      
      if (onProgress) onProgress('Scanning for tokens...', 15);
      
      // Step 2: Find tokens by scanning recent transfers
      const tokenAddresses = await this.findTokensByTransfers(walletAddress, provider, onProgress);
      
      if (onProgress) onProgress(`Found ${tokenAddresses.size} tokens, fetching balances...`, 30);
      
      // Step 3: Fetch balances for all found tokens
      const tokenArray = Array.from(tokenAddresses);
      const batchSize = 10;
      let processedCount = 0;
      
      for (let i = 0; i < tokenArray.length; i += batchSize) {
        const batch = tokenArray.slice(i, i + batchSize);
        const batchPromises = batch.map(async (tokenAddress) => {
          try {
            const tokenInfo = await this.getTokenInfo(tokenAddress, walletAddress, provider);
            if (tokenInfo && tokenInfo.balance !== '0') {
              const balanceFormatted = parseFloat(
                ethers.utils.formatUnits(tokenInfo.balance, tokenInfo.decimals)
              );
              
              if (balanceFormatted > 0) {
                processedTokens.push({
                  address: tokenInfo.address,
                  symbol: tokenInfo.symbol || 'Unknown',
                  name: tokenInfo.name || 'Unknown Token',
                  decimals: tokenInfo.decimals,
                  balance: tokenInfo.balance,
                  balanceFormatted,
                  price: 0, // Will be fetched by price service
                  value: 0,
                  logo: '', // Will be fetched by logo service
                  verified: false
                });
              }
            }
          } catch (error) {
            console.error(`Failed to get info for token ${tokenAddress}:`, error);
          }
        });
        
        await Promise.all(batchPromises);
        processedCount += batch.length;
        
        const progress = 30 + Math.round((processedCount / tokenArray.length) * 40); // 30% to 70%
        if (onProgress) onProgress(`Processing tokens... (${processedCount}/${tokenArray.length})`, progress);
      }
      
      if (onProgress) onProgress('Token scan complete', 80);
      
      return processedTokens;
    } catch (error) {
      console.error('Error fetching wallet tokens:', error);
      throw error;
    }
  }

  /**
   * Find tokens by scanning transfer events
   */
  private async findTokensByTransfers(
    walletAddress: string,
    provider: ethers.providers.JsonRpcProvider,
    onProgress?: (message: string, progress: number) => void
  ): Promise<Set<string>> {
    const tokenAddresses = new Set<string>();
    const currentBlock = await provider.getBlockNumber();
    const blocksToScan = 50000; // Scan last ~1 day of blocks
    const startBlock = Math.max(0, currentBlock - blocksToScan);
    const chunkSize = 5000; // Process in chunks
    
    // Create filters for incoming and outgoing transfers
    const incomingFilter = {
      topics: [
        TRANSFER_EVENT_TOPIC,
        null, // from any address
        ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32) // to our wallet
      ],
      fromBlock: startBlock,
      toBlock: currentBlock
    };
    
    const outgoingFilter = {
      topics: [
        TRANSFER_EVENT_TOPIC,
        ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32), // from our wallet
        null // to any address
      ],
      fromBlock: startBlock,
      toBlock: currentBlock
    };
    
    // Scan in chunks to avoid RPC limits
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += chunkSize) {
      const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);
      
      try {
        const [incomingLogs, outgoingLogs] = await Promise.all([
          provider.getLogs({ ...incomingFilter, fromBlock, toBlock }),
          provider.getLogs({ ...outgoingFilter, fromBlock, toBlock })
        ]);
        
        // Add all token addresses from logs
        [...incomingLogs, ...outgoingLogs].forEach(log => {
          tokenAddresses.add(log.address.toLowerCase());
        });
        
        const progress = 15 + Math.round(((fromBlock - startBlock) / blocksToScan) * 15); // 15% to 30%
        if (onProgress) onProgress(`Scanning blocks... ${toBlock - startBlock}/${blocksToScan}`, progress);
      } catch (error) {
        console.error(`Error scanning blocks ${fromBlock}-${toBlock}:`, error);
      }
    }
    
    // Always include native tokens if they're not already found
    NATIVE_TOKENS.forEach(token => tokenAddresses.add(token));
    
    return tokenAddresses;
  }

  /**
   * Get token information including balance
   */
  private async getTokenInfo(
    tokenAddress: string,
    walletAddress: string,
    provider: ethers.providers.JsonRpcProvider
  ): Promise<TokenInfo | null> {
    try {
      // Check cache first
      const cached = this.tokenCache.get(tokenAddress.toLowerCase());
      if (cached) {
        // Still need to fetch fresh balance
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        return { ...cached, balance: balance.toString() };
      }
      
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      // Fetch all token data in parallel
      const [balance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol().catch(() => 'Unknown'),
        contract.name().catch(() => 'Unknown Token')
      ]);
      
      const tokenInfo = {
        address: tokenAddress.toLowerCase(),
        balance: balance.toString(),
        decimals,
        symbol,
        name
      };
      
      // Cache token metadata (not balance)
      this.tokenCache.set(tokenAddress.toLowerCase(), {
        ...tokenInfo,
        balance: '0' // Don't cache balance
      });
      
      return tokenInfo;
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Clear token cache
   */
  clearCache() {
    this.tokenCache.clear();
  }
}

// Export singleton instance
export const clientBlockchainService = new ClientBlockchainService();