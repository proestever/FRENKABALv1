/**
 * Scanner Balance Service
 * Uses PulseChain Scan API for efficient wallet data fetching
 * with recent block scanning for real-time updates
 */

import { ethers } from 'ethers';
import { ProcessedToken, PulseChainTokenBalance, PulseChainAddressResponse } from '../types';
import { getProvider } from './rpc-provider';
import { storage } from '../storage';
import { updateLoadingProgress } from '../routes';
import { getTokenPriceDataFromDexScreener } from './dexscreener';
import { isLiquidityPoolToken, processLpTokens } from './lp-token-service';
import { executeWithFailover } from './rpc-provider';
import { enhancedScanner } from './enhanced-scanner-service';

const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const RECENT_BLOCKS_TO_SCAN = 100000; // Last ~33 hours of blocks for near real-time updates
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const PLS_DECIMALS = 18;

// Blacklisted tokens that cause issues
const BLACKLISTED_TOKENS = new Set([
  "0xd3ab6b7203c417c2b71c36aeade50020c1f6e41a" // ultlotto - causes astronomical values
]);

/**
 * Get default logo for known tokens
 */
function getDefaultLogo(symbol: string): string {
  const symbolLower = symbol.toLowerCase();
  
  const logoMap: Record<string, string> = {
    'pls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'wpls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'plsx': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c5D52810B6f40.png',
    'hex': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
    'inc': 'https://tokens.app.pulsex.com/images/tokens/0x6c203a555824ec90a215f37916cf8db58ebe2fa3.png'
  };
  
  return logoMap[symbolLower] || '/assets/100xfrenlogo.png';
}

interface TokenBalanceFromScanner {
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: string;
    type: string;
  };
  value: string;
}

/**
 * Fetch token balances from PulseChain Scan API with retry logic
 */
async function fetchTokenBalancesFromScanner(walletAddress: string, retries: number = 3): Promise<Map<string, TokenBalanceFromScanner>> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add delay between retries to avoid rate limiting
      if (attempt > 0) {
        const delay = attempt * 1000; // 1s, 2s, 3s
        console.log(`Retry attempt ${attempt + 1} for ${walletAddress} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log(`Fetching token balances from PulseChain Scan for ${walletAddress} (attempt ${attempt + 1})`);
      
      const url = `${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}/token-balances`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`Scanner API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const balances = new Map<string, TokenBalanceFromScanner>();
      
      // Process the response - it could be an array or object with items
      const items = Array.isArray(data) ? data : (data.items || []);
      
      items.forEach((item: any) => {
        if (item.token && item.value && item.value !== '0') {
          // Skip blacklisted tokens
          const tokenAddress = item.token.address.toLowerCase();
          if (BLACKLISTED_TOKENS.has(tokenAddress)) {
            console.log(`Filtering out blacklisted token from scanner: ${tokenAddress} (${item.token.symbol})`);
            return;
          }
          balances.set(tokenAddress, item);
        }
      });
      
      console.log(`Found ${balances.size} tokens from scanner for ${walletAddress}`);
      return balances;
    } catch (error) {
      lastError = error as Error;
      console.error(`Error fetching token balances from scanner (attempt ${attempt + 1}):`, error);
      
      // If this is a rate limit error (429), wait longer before retry
      if (error instanceof Error && error.message.includes('429')) {
        const rateLimitDelay = (attempt + 1) * 5000; // 5s, 10s, 15s for rate limits
        console.log(`Rate limited, waiting ${rateLimitDelay}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      }
    }
  }
  
  // If all retries failed, log the error but return empty map instead of throwing
  console.error(`Failed to fetch scanner balances for ${walletAddress} after ${retries} attempts:`, lastError);
  return new Map<string, TokenBalanceFromScanner>();
}

/**
 * Fetch wallet info from PulseChain Scan API
 */
async function fetchWalletInfoFromScanner(walletAddress: string): Promise<PulseChainAddressResponse | null> {
  try {
    const url = `${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching wallet info from scanner:', error);
    return null;
  }
}

/**
 * Scan recent blocks for any new token transfers
 */
async function scanRecentBlocks(walletAddress: string, blocksToScan: number = RECENT_BLOCKS_TO_SCAN): Promise<Set<string>> {
  try {
    console.log(`Scanning last ${blocksToScan} blocks for recent transfers`);
    
    const currentBlock = await executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
    
    const fromBlock = Math.max(0, currentBlock - blocksToScan);
    const normalizedAddress = walletAddress.toLowerCase();
    const paddedAddress = ethers.utils.hexZeroPad(normalizedAddress, 32);
    
    // Split into chunks for large block ranges to avoid RPC limits
    const CHUNK_SIZE = 10000;
    const chunks: { from: number; to: number }[] = [];
    
    for (let i = fromBlock; i < currentBlock; i += CHUNK_SIZE) {
      chunks.push({
        from: i,
        to: Math.min(i + CHUNK_SIZE - 1, currentBlock)
      });
    }
    
    console.log(`Scanning ${chunks.length} chunks of blocks`);
    
    // Process chunks in parallel
    const allLogs = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const [incomingLogs, outgoingLogs] = await Promise.all([
            executeWithFailover(async (provider) => {
              return await provider.getLogs({
                fromBlock: chunk.from,
                toBlock: chunk.to,
                topics: [TRANSFER_EVENT_TOPIC, null, paddedAddress]
              });
            }),
            executeWithFailover(async (provider) => {
              return await provider.getLogs({
                fromBlock: chunk.from,
                toBlock: chunk.to,
                topics: [TRANSFER_EVENT_TOPIC, paddedAddress, null]
              });
            })
          ]);
          return [...incomingLogs, ...outgoingLogs];
        } catch (error) {
          console.error(`Error scanning chunk ${chunk.from}-${chunk.to}:`, error);
          return [];
        }
      })
    );
    
    // Collect unique token addresses from all chunks
    const recentTokens = new Set<string>();
    allLogs.flat().forEach(log => {
      if (log.address) {
        recentTokens.add(log.address.toLowerCase());
      }
    });
    
    console.log(`Found ${recentTokens.size} tokens in recent ${blocksToScan} blocks`);
    return recentTokens;
  } catch (error) {
    console.error('Error scanning recent blocks:', error);
    return new Set();
  }
}

/**
 * Get token balance directly from contract
 */
async function getTokenBalanceFromContract(tokenAddress: string, walletAddress: string): Promise<{
  balance: string;
  decimals: number;
  symbol: string;
  name: string;
} | null> {
  try {
    const tokenInfo = await executeWithFailover(async (provider) => {
      const contract = new ethers.Contract(tokenAddress, [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
      ], provider);
      
      const [balance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
        contract.name()
      ]);
      
      return { balance: balance.toString(), decimals, symbol, name };
    });
    
    return tokenInfo;
  } catch (error) {
    console.error(`Error getting balance for token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fast scanner function for portfolios - uses only PulseChain Scan API without enhanced features
 */
export async function getFastScannerTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    console.log(`Getting fast token balances from PulseChain Scan for ${walletAddress}`);
    const startTime = Date.now();
    
    // Fetch token balances from scanner API
    const scannerBalances = await fetchTokenBalancesFromScanner(walletAddress);
    
    // Get PLS balance
    const plsBalance = await executeWithFailover(async (provider) => {
      return await provider.getBalance(walletAddress);
    });
    
    // Convert scanner balances to ProcessedToken format
    const tokens: ProcessedToken[] = [];
    
    // Add PLS as first token if balance > 0
    if (plsBalance && plsBalance.gt(0)) {
      const plsAmount = parseFloat(ethers.utils.formatEther(plsBalance));
      tokens.push({
        address: 'native',
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: 18,
        balance: plsBalance.toString(),
        balanceFormatted: plsAmount,
        price: 0, // Will be fetched client-side
        value: 0, // Will be calculated client-side
        isNative: true,
        verified: true
      });
    }
    
    // Process scanner tokens
    Array.from(scannerBalances).forEach(([tokenAddress, tokenData]) => {
      const amount = parseFloat(ethers.utils.formatUnits(tokenData.value, tokenData.token.decimals));
      
      // Skip tokens with extremely small amounts that could cause calculation errors
      // This filters out dust tokens and broken liquidity pools
      if (amount < 0.000001) {
        console.log(`Skipping dust token ${tokenData.token.symbol} with amount ${amount}`);
        return;
      }
      
      tokens.push({
        address: tokenData.token.address,
        symbol: tokenData.token.symbol,
        name: tokenData.token.name,
        decimals: parseInt(tokenData.token.decimals),
        balance: tokenData.value,
        balanceFormatted: amount,
        price: 0, // Will be fetched client-side
        value: 0, // Will be calculated client-side
        verified: tokenData.token.type === 'verified'
      });
    });
    
    const endTime = Date.now();
    console.log(`Fast scanner fetch completed in ${endTime - startTime}ms - found ${tokens.length} tokens`);
    
    return tokens;
  } catch (error) {
    console.error('Error in fast scanner token fetch:', error);
    throw error;
  }
}

/**
 * Main function to get token balances using Enhanced Scanner
 */
export async function getScannerTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    console.log(`Getting token balances using Enhanced Scanner for ${walletAddress}`);
    const startTime = Date.now();
    
    // Update progress - Starting
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 0,
      totalBatches: 100,
      message: 'Fetching wallet data...'
    });
    
    // Use the enhanced scanner to fetch all data
    const scanResult = await enhancedScanner.scan(walletAddress, { analyzeLPs: true });
    
    // Update progress - Processing complete
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 80,
      totalBatches: 100,
      message: 'Processing token data...'
    });
    
    // Get logos for tokens
    const tokensWithLogos = await Promise.all(
      scanResult.tokens.map(async (token) => {
        let logoUrl = token.logo || null;
        
        // Try to get logo from storage or DexScreener if not already set
        if (!logoUrl && !token.isNative) {
          try {
            // Check storage first
            const storedLogo = await storage.getTokenLogo(token.address.toLowerCase());
            if (storedLogo?.logoUrl) {
              logoUrl = storedLogo.logoUrl;
            } else {
              // Fetch from DexScreener
              const priceData = await getTokenPriceDataFromDexScreener(token.address).catch(() => null);
              if (priceData?.logo) {
                logoUrl = priceData.logo;
                // Save logo to database
                await storage.saveTokenLogo({
                  tokenAddress: token.address.toLowerCase(),
                  logoUrl: priceData.logo,
                  symbol: token.symbol,
                  name: token.name,
                  lastUpdated: new Date().toISOString()
                }).catch(error => console.error(`Failed to save logo for ${token.address}:`, error));
              }
            }
          } catch (error) {
            console.error(`Failed to get logo for ${token.address}:`, error);
          }
        }
        
        // Use default logo if still no logo
        if (!logoUrl) {
          logoUrl = getDefaultLogo(token.symbol);
        }
        
        return {
          ...token,
          logo: logoUrl
        };
      })
    );
    
    const endTime = Date.now();
    console.log(`Enhanced scanner fetch completed in ${endTime - startTime}ms`);
    console.log(`Found ${tokensWithLogos.length} tokens with total value $${scanResult.totalValue.toFixed(2)}`);
    
    if (scanResult.lpSummary) {
      console.log(`LP Summary: ${scanResult.lpSummary.count} positions worth $${scanResult.lpSummary.totalValue.toFixed(2)}`);
    }
    
    // Update progress - Complete
    updateLoadingProgress({
      status: 'complete',
      currentBatch: 100,
      totalBatches: 100,
      message: 'Processing complete'
    });
    
    return tokensWithLogos;
  } catch (error) {
    console.error('Error getting scanner token balances:', error);
    
    updateLoadingProgress({
      status: 'error',
      currentBatch: 0,
      totalBatches: 100,
      message: 'Error loading wallet data. Please try again.'
    });
    
    throw error;
  }
}

/**
 * Get token price from DexScreener (helper function)
 */
async function getTokenPriceFromDexScreener(tokenAddress: string): Promise<number | null> {
  try {
    const priceData = await getTokenPriceDataFromDexScreener(tokenAddress);
    return priceData?.price || null;
  } catch (error) {
    return null;
  }
}