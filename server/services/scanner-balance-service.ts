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

const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const RECENT_BLOCKS_TO_SCAN = 1000; // Last ~20 minutes of blocks
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const PLS_DECIMALS = 18;

/**
 * Get default logo for known tokens
 */
function getDefaultLogo(symbol: string): string {
  // Only provide default logo for native PLS token
  const symbolLower = symbol.toLowerCase();
  if (symbolLower === 'pls') {
    return '/assets/pls-logo-trimmed.png';
  }
  // Return empty string for all other tokens - let client fetch from DexScreener
  return '';
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
 * Fetch token balances from PulseChain Scan API
 */
async function fetchTokenBalancesFromScanner(walletAddress: string): Promise<Map<string, TokenBalanceFromScanner>> {
  try {
    console.log(`Fetching token balances from PulseChain Scan for ${walletAddress}`);
    
    const url = `${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}/token-balances`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
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
        balances.set(item.token.address.toLowerCase(), item);
      }
    });
    
    console.log(`Found ${balances.size} tokens from scanner`);
    return balances;
  } catch (error) {
    console.error('Error fetching token balances from scanner:', error);
    throw error;
  }
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
    
    // Fetch incoming and outgoing transfers in parallel
    const [incomingLogs, outgoingLogs] = await Promise.all([
      executeWithFailover(async (provider) => {
        return await provider.getLogs({
          fromBlock,
          toBlock: currentBlock,
          topics: [TRANSFER_EVENT_TOPIC, null, paddedAddress]
        });
      }),
      executeWithFailover(async (provider) => {
        return await provider.getLogs({
          fromBlock,
          toBlock: currentBlock,
          topics: [TRANSFER_EVENT_TOPIC, paddedAddress, null]
        });
      })
    ]);
    
    // Collect unique token addresses
    const recentTokens = new Set<string>();
    [...incomingLogs, ...outgoingLogs].forEach(log => {
      if (log.address) {
        recentTokens.add(log.address.toLowerCase());
      }
    });
    
    console.log(`Found ${recentTokens.size} tokens in recent blocks`);
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
 * Main function to get token balances using Scanner API + recent blocks
 */
export async function getScannerTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    console.log(`Getting token balances using Scanner API for ${walletAddress}`);
    const startTime = Date.now();
    
    // Update progress - Starting
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 0,
      totalBatches: 100,
      message: 'Fetching wallet data...'
    });
    
    // Fetch data from scanner and recent blocks in parallel
    const [scannerBalances, walletInfo, recentTokens] = await Promise.all([
      fetchTokenBalancesFromScanner(walletAddress),
      fetchWalletInfoFromScanner(walletAddress),
      scanRecentBlocks(walletAddress)
    ]);
    
    // Update progress - Processing tokens (20%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 20,
      totalBatches: 100,
      message: 'Processing token balances...'
    });
    
    const processedTokens: ProcessedToken[] = [];
    
    // Add native PLS balance from wallet info or direct query
    let plsBalance: ethers.BigNumber;
    if (walletInfo && walletInfo.coin_balance) {
      plsBalance = ethers.BigNumber.from(walletInfo.coin_balance);
    } else {
      plsBalance = await executeWithFailover(async (provider) => {
        return await provider.getBalance(walletAddress);
      });
    }
    
    const plsBalanceFormatted = parseFloat(ethers.utils.formatUnits(plsBalance, PLS_DECIMALS));
    const plsPrice = await getTokenPriceFromDexScreener(WPLS_CONTRACT_ADDRESS) || 0;
    
    if (plsBalanceFormatted > 0) {
      processedTokens.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: plsBalance.toString(),
        balanceFormatted: plsBalanceFormatted,
        price: plsPrice,
        value: plsBalanceFormatted * plsPrice,
        logo: getDefaultLogo('PLS'),
        isNative: true,
        verified: true
      });
    }
    
    // Process all tokens from scanner
    const tokenAddresses = new Set<string>([...scannerBalances.keys(), ...recentTokens]);
    console.log(`Processing ${tokenAddresses.size} unique tokens`);
    
    // Update progress - Fetching token details (40%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 40,
      totalBatches: 100,
      message: `Fetching details for ${tokenAddresses.size} tokens...`
    });
    
    // Process tokens in batches
    const BATCH_SIZE = 50;
    const tokenArray = Array.from(tokenAddresses);
    const batches: string[][] = [];
    
    for (let i = 0; i < tokenArray.length; i += BATCH_SIZE) {
      batches.push(tokenArray.slice(i, i + BATCH_SIZE));
    }
    
    // Process all batches in parallel
    let processedCount = 0;
    const batchPromises = batches.map(async (batch, batchIndex) => {
      const batchResults = await Promise.all(
        batch.map(async (tokenAddress) => {
          try {
            // Check if we have scanner data for this token
            const scannerData = scannerBalances.get(tokenAddress);
            let tokenInfo;
            
            if (scannerData) {
              // Use scanner data
              const decimals = parseInt(scannerData.token.decimals);
              const balanceFormatted = parseFloat(ethers.utils.formatUnits(scannerData.value, decimals));
              
              tokenInfo = {
                balance: scannerData.value,
                decimals,
                symbol: scannerData.token.symbol,
                name: scannerData.token.name,
                balanceFormatted
              };
            } else {
              // Token found in recent blocks but not in scanner, get balance from contract
              const contractData = await getTokenBalanceFromContract(tokenAddress, walletAddress);
              if (!contractData || contractData.balance === '0') return null;
              
              const balanceFormatted = parseFloat(ethers.utils.formatUnits(contractData.balance, contractData.decimals));
              tokenInfo = {
                ...contractData,
                balanceFormatted
              };
            }
            
            if (tokenInfo.balanceFormatted === 0) return null;
            
            // Get price data from DexScreener
            const priceData = await getTokenPriceDataFromDexScreener(tokenAddress).catch(() => null);
            
            // First check database for existing logo
            let logoUrl = '';
            try {
              const dbLogo = await storage.getTokenLogo(tokenAddress.toLowerCase());
              if (dbLogo && dbLogo.hasLogo && dbLogo.logoUrl) {
                logoUrl = dbLogo.logoUrl;
              }
            } catch (error) {
              console.error(`Error fetching logo from database for ${tokenAddress}:`, error);
            }
            
            // If no logo in database and DexScreener has one, save it
            if (!logoUrl && priceData?.logo) {
              logoUrl = priceData.logo;
              // Save logo to database with new schema
              try {
                await storage.saveTokenLogo({
                  tokenAddress: tokenAddress.toLowerCase(),
                  logoUrl: priceData.logo,
                  symbol: tokenInfo.symbol,
                  name: tokenInfo.name,
                  hasLogo: true,
                  lastAttempt: new Date()
                });
              } catch (error) {
                console.error(`Failed to save logo for ${tokenAddress}:`, error);
              }
            }
            
            // If still no logo, check default (only PLS)
            if (!logoUrl) {
              logoUrl = getDefaultLogo(tokenInfo.symbol);
            }
            
            return {
              address: tokenAddress,
              symbol: tokenInfo.symbol,
              name: tokenInfo.name,
              decimals: tokenInfo.decimals,
              balance: tokenInfo.balance,
              balanceFormatted: tokenInfo.balanceFormatted,
              price: priceData?.price || 0,
              value: tokenInfo.balanceFormatted * (priceData?.price || 0),
              logo: logoUrl,
              verified: scannerData?.token.type === 'ERC-20'
            };
          } catch (error) {
            console.error(`Error processing token ${tokenAddress}:`, error);
            return null;
          }
        })
      );
      
      // Update progress
      processedCount += batch.length;
      const progress = Math.floor((processedCount / tokenArray.length) * 40) + 40;
      updateLoadingProgress({
        status: 'loading',
        currentBatch: Math.min(progress, 80),
        totalBatches: 100,
        message: `Processing tokens... (${processedCount}/${tokenArray.length})`
      });
      
      return batchResults.filter(result => result !== null);
    });
    
    const batchResults = await Promise.all(batchPromises);
    processedTokens.push(...batchResults.flat());
    
    // Update progress - Checking LP tokens (80%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 80,
      totalBatches: 100,
      message: 'Analyzing LP tokens...'
    });
    
    // Detect and process LP tokens
    const lpCheckPromises = processedTokens.map(async (token) => {
      try {
        const isLp = await isLiquidityPoolToken(token.address);
        if (isLp) {
          console.log(`Detected LP token: ${token.symbol}`);
          token.isLp = true;
        }
      } catch (error) {
        // Skip if can't determine LP status
      }
    });
    
    await Promise.all(lpCheckPromises);
    
    // Process LP tokens for pooled amounts
    const lpTokens = processedTokens.filter(t => t.isLp);
    if (lpTokens.length > 0) {
      console.log(`Processing ${lpTokens.length} LP tokens`);
      const processedWithLp = await processLpTokens(processedTokens, walletAddress);
      processedTokens.length = 0;
      processedTokens.push(...processedWithLp);
    }
    
    // Sort by value descending
    processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Update progress - Complete
    updateLoadingProgress({
      status: 'complete',
      currentBatch: 100,
      totalBatches: 100,
      message: 'Processing complete'
    });
    
    const endTime = Date.now();
    console.log(`Scanner balance fetch completed in ${endTime - startTime}ms`);
    console.log(`Found ${processedTokens.length} tokens with non-zero balances`);
    
    return processedTokens;
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