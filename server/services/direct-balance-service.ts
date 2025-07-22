import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getDefaultLogo } from './blockchain-service';
import { getTokenPriceFromDexScreener, getTokenPriceDataFromDexScreener } from './dexscreener';
import { storage } from '../storage';
import { isLiquidityPoolToken, processLpTokens } from './lp-token-service';
import { updateLoadingProgress } from '../routes';
import { getProvider, executeWithFailover } from './rpc-provider';


// Constants
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

// Standard ERC20 ABI for getting token metadata and balance
const ERC20_ABI = [
  {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}
];

/**
 * Get all unique token addresses a wallet has interacted with
 */
async function getWalletTokens(walletAddress: string): Promise<Set<string>> {
  try {
    console.log(`Finding all tokens interacted with by ${walletAddress}`);
    const startTime = Date.now();
    
    // Normalize wallet address
    const normalizedAddress = walletAddress.toLowerCase();
    const paddedAddress = ethers.utils.hexZeroPad(normalizedAddress, 32);
    
    // Get current block with failover
    const currentBlock = await executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
    
    // For much better performance, only look back 100k blocks (~10 days on PulseChain)
    // This captures recent activity without taking forever to scan
    const BLOCK_LOOKBACK = 100000;
    const fromBlock = Math.max(0, currentBlock - BLOCK_LOOKBACK);
    
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock} (last ${BLOCK_LOOKBACK} blocks)`);
    
    // Fetch transfer events in parallel with chunking for large ranges
    const CHUNK_SIZE = 50000; // 50k blocks per chunk for faster processing
    const chunks: Array<{from: number, to: number}> = [];
    
    for (let block = fromBlock; block <= currentBlock; block += CHUNK_SIZE) {
      chunks.push({
        from: block,
        to: Math.min(block + CHUNK_SIZE - 1, currentBlock)
      });
    }
    
    // Process chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      try {
        const [incoming, outgoing] = await Promise.all([
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
        return [...incoming, ...outgoing];
      } catch (error) {
        console.warn(`Error fetching logs for chunk ${chunk.from}-${chunk.to}:`, error);
        return [];
      }
    });
    
    const allChunkResults = await Promise.all(chunkPromises);
    const allLogs = allChunkResults.flat();
    
    // Extract unique token addresses
    const tokenAddresses = new Set<string>();
    allLogs.forEach(log => {
      tokenAddresses.add(log.address.toLowerCase());
    });
    
    const endTime = Date.now();
    console.log(`Found ${tokenAddresses.size} unique tokens in ${endTime - startTime}ms`);
    
    return tokenAddresses;
  } catch (error) {
    console.error('Error getting wallet tokens:', error);
    throw error;
  }
}

/**
 * Get token metadata and current balance
 */
async function getTokenInfo(tokenAddress: string, walletAddress: string): Promise<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
} | null> {
  try {
    return await executeWithFailover(async (provider) => {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      // Get metadata and balance in parallel
      const [decimals, symbol, name, balance] = await Promise.all([
        contract.decimals().catch(() => 18),
        contract.symbol().catch(() => 'UNKNOWN'),
        contract.name().catch(() => 'Unknown Token'),
        contract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
      ]);
    
      const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));
      
      // Skip if balance is essentially zero
      if (balanceFormatted < 0.000001) {
        return null;
      }
      
      return {
        address: tokenAddress,
        symbol,
        name,
        decimals,
        balance: balance.toString(),
        balanceFormatted
      };
    });
  } catch (error) {
    console.error(`Error getting info for token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get direct balances for all tokens a wallet has interacted with
 */
export async function getDirectTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    console.log(`Getting direct token balances for ${walletAddress}`);
    const startTime = Date.now();
    
    // Update progress - Fetching tokens
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 0,
      totalBatches: 100, // Use percentage
      message: 'Fetching tokens...'
    });
    
    // Get all tokens the wallet has interacted with
    const tokenAddresses = await getWalletTokens(walletAddress);
    console.log(`Fetching balances for ${tokenAddresses.size} tokens...`);
    
    // Get native PLS balance first with failover
    const plsBalance = await executeWithFailover(async (provider) => {
      return await provider.getBalance(walletAddress);
    });
    const plsBalanceFormatted = parseFloat(ethers.utils.formatUnits(plsBalance, PLS_DECIMALS));
    const plsPrice = await getTokenPriceFromDexScreener(WPLS_CONTRACT_ADDRESS) || 0;
    
    let processedTokens: ProcessedToken[] = [];
    
    // Add native PLS if balance > 0
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
        logo: getDefaultLogo('PLS') || undefined,
        isNative: true,
        verified: true
      });
    }
    
    // Continue showing fetching tokens progress
    
    // Process tokens in larger batches for better performance
    const BATCH_SIZE = 100; // Increased to 100 for even faster processing
    const tokenArray = Array.from(tokenAddresses);
    const totalTokens = tokenArray.length;
    
    // Split tokens into batches
    const batches: string[][] = [];
    for (let i = 0; i < tokenArray.length; i += BATCH_SIZE) {
      batches.push(tokenArray.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Processing ${totalTokens} tokens in ${batches.length} batches of ${BATCH_SIZE}`);
    
    // Process all batches in parallel
    const batchPromises = batches.map(async (batch, batchIndex) => {
      const batchResults = await Promise.all(
        batch.map(async (tokenAddress) => {
          try {
            // Get token info and price data in parallel
            const [tokenInfo, priceData] = await Promise.all([
              getTokenInfo(tokenAddress, walletAddress),
              getTokenPriceDataFromDexScreener(tokenAddress).catch(() => null)
            ]);
            
            if (!tokenInfo) return null;
            
            // Initialize logo URL with default
            let logoUrl = getDefaultLogo(tokenInfo.symbol);
            
            // Check if DexScreener provided a logo
            if (priceData && priceData.logo) {
              logoUrl = priceData.logo;
              
              // Save the DexScreener logo to database
              try {
                await storage.saveTokenLogo({
                  tokenAddress: tokenAddress.toLowerCase(),
                  logoUrl: priceData.logo,
                  symbol: tokenInfo.symbol,
                  name: tokenInfo.name,
                  lastUpdated: new Date().toISOString()
                });
              } catch (error) {
                console.error(`Failed to save DexScreener logo for ${tokenAddress}:`, error);
              }
            } else {
              // No DexScreener logo, check if we have a stored logo
              try {
                const storedLogo = await storage.getTokenLogo(tokenAddress);
                if (storedLogo?.logoUrl) {
                  logoUrl = storedLogo.logoUrl;
                } else {
                  // Save null logo
                  await storage.saveTokenLogo({
                    tokenAddress: tokenAddress.toLowerCase(),
                    logoUrl: null,
                    symbol: tokenInfo.symbol,
                    name: tokenInfo.name,
                    lastUpdated: new Date().toISOString()
                  });
                  logoUrl = null;
                }
              } catch (error) {
                // Use null logo
                logoUrl = null;
              }
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
              logo: logoUrl || undefined,
              verified: false
            };
          } catch (error) {
            console.error(`Error processing token ${tokenAddress}:`, error);
            return null;
          }
        })
      );
      
      // Update progress as batches complete
      const completedTokens = (batchIndex + 1) * BATCH_SIZE;
      const tokenProgress = Math.min((completedTokens / totalTokens) * 25, 25);
      
      updateLoadingProgress({
        status: 'loading',
        currentBatch: Math.floor(tokenProgress),
        totalBatches: 100,
        message: `Fetching tokens... (${Math.min(completedTokens, totalTokens)}/${totalTokens})`
      });
      
      return batchResults.filter(result => result !== null);
    });
    
    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Flatten results and add to processedTokens
    processedTokens.push(...batchResults.flat());
    
    // Update progress - Fetching LPs (25%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 25,
      totalBatches: 100,
      message: 'Fetching LPs...'
    });
    
    // Detect LP tokens in parallel
    console.log(`Checking ${processedTokens.length} tokens for LP interface`);
    const lpCheckPromises = processedTokens.map(async (token) => {
      try {
        const isLp = await isLiquidityPoolToken(token.address);
        if (isLp) {
          console.log(`Detected LP token: ${token.symbol} (${token.address})`);
          token.isLp = true;
        }
      } catch (error) {
        // Skip if can't determine LP status
      }
    });
    
    // Wait for all LP checks to complete
    await Promise.all(lpCheckPromises);
    
    // Process LP tokens to get pooled amounts
    const lpTokens = processedTokens.filter(t => t.isLp);
    if (lpTokens.length > 0) {
      console.log(`Processing ${lpTokens.length} LP tokens for pooled amounts`);
      const processedTokensWithLp = await processLpTokens(processedTokens, walletAddress);
      processedTokens = processedTokensWithLp;
    }
    
    // Update progress - Fetching HEX stakes (50%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 50,
      totalBatches: 100,
      message: 'Fetching HEX stakes...'
    });
    
    // Sort by value descending
    processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Update progress - Fetching prices (75%)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 75,
      totalBatches: 100,
      message: 'Fetching prices...'
    });
    
    const endTime = Date.now();
    console.log(`Direct balance fetch completed in ${endTime - startTime}ms`);
    console.log(`Found ${processedTokens.length} tokens with non-zero balances`);
    
    // Update progress - Complete (100%)
    updateLoadingProgress({
      status: 'complete',
      currentBatch: 100,
      totalBatches: 100,
      message: 'Processing complete'
    });
    
    return processedTokens;
  } catch (error) {
    console.error('Error getting direct token balances:', error);
    
    // Update progress - Error
    updateLoadingProgress({
      status: 'error',
      currentBatch: 0,
      totalBatches: 7,
      message: 'Error loading wallet data. Please try again.'
    });
    
    throw error;
  }
}