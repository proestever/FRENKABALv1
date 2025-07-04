import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getDefaultLogo } from './blockchain-service';
import { getTokenPriceFromDexScreener } from './dexscreener';
import { storage } from '../storage';
import { isLiquidityPoolToken, processLpTokens } from './lp-token-service';
import { updateLoadingProgress } from '../routes';

// Initialize ethers provider
const RPC_ENDPOINT = 'https://rpc-pulsechain.g4mm4.io';
const provider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINT);

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
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    
    // Fetch all transfer events where wallet is sender or receiver
    const [incomingLogs, outgoingLogs] = await Promise.all([
      provider.getLogs({
        fromBlock: 0,
        toBlock: currentBlock,
        topics: [TRANSFER_EVENT_TOPIC, null, paddedAddress]
      }),
      provider.getLogs({
        fromBlock: 0,
        toBlock: currentBlock,
        topics: [TRANSFER_EVENT_TOPIC, paddedAddress, null]
      })
    ]);
    
    // Extract unique token addresses
    const tokenAddresses = new Set<string>();
    [...incomingLogs, ...outgoingLogs].forEach(log => {
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
    
    // Update progress - Connecting to blockchain
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 0,
      totalBatches: 7,
      message: 'Connecting to PulseChain network...'
    });
    
    // Get all tokens the wallet has interacted with
    const tokenAddresses = await getWalletTokens(walletAddress);
    console.log(`Fetching balances for ${tokenAddresses.size} tokens...`);
    
    // Update progress - Fetching wallet information
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 7,
      message: 'Fetching wallet information...'
    });
    
    // Get native PLS balance first
    const plsBalance = await provider.getBalance(walletAddress);
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
        logo: getDefaultLogo('PLS'),
        isNative: true,
        verified: true
      });
    }
    
    // Update progress - Scanning token balances
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 2,
      totalBatches: 7,
      message: `Scanning ${tokenAddresses.size} token balances...`
    });
    
    // Process tokens in batches
    const BATCH_SIZE = 5;
    const tokenArray = Array.from(tokenAddresses);
    
    for (let i = 0; i < tokenArray.length; i += BATCH_SIZE) {
      const batch = tokenArray.slice(i, i + BATCH_SIZE);
      
      // Update progress with current batch
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(tokenArray.length / BATCH_SIZE);
      updateLoadingProgress({
        status: 'loading',
        currentBatch: 2,
        totalBatches: 7,
        message: `Scanning token balances (${Math.min(i + BATCH_SIZE, tokenArray.length)}/${tokenArray.length})...`
      });
      
      await Promise.all(batch.map(async (tokenAddress) => {
        const tokenInfo = await getTokenInfo(tokenAddress, walletAddress);
        if (!tokenInfo) return;
        
        // Get price
        const price = await getTokenPriceFromDexScreener(tokenAddress) || 0;
        
        // Get logo
        let logoUrl = getDefaultLogo(tokenInfo.symbol);
        try {
          const storedLogo = await storage.getTokenLogo(tokenAddress);
          if (storedLogo && storedLogo.logoUrl) {
            logoUrl = storedLogo.logoUrl;
          }
        } catch (error) {
          // Use default logo
        }
        
        processedTokens.push({
          address: tokenAddress,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          decimals: tokenInfo.decimals,
          balance: tokenInfo.balance,
          balanceFormatted: tokenInfo.balanceFormatted,
          price,
          value: tokenInfo.balanceFormatted * price,
          logo: logoUrl,
          verified: false
        });
      }));
      
      // Small delay between batches
      if (i + BATCH_SIZE < tokenArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Update progress - Retrieving token prices (step 3 is already handled in the batch loop)
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 3,
      totalBatches: 7,
      message: 'Retrieving token prices...'
    });
    
    // Add small delay to show price fetching progress
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update progress - Analyzing LP positions
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 4,
      totalBatches: 7,
      message: 'Analyzing LP positions...'
    });
    
    // Detect LP tokens
    console.log(`Checking ${processedTokens.length} tokens for LP interface`);
    for (const token of processedTokens) {
      try {
        const isLp = await isLiquidityPoolToken(token.address);
        if (isLp) {
          console.log(`Detected LP token: ${token.symbol} (${token.address})`);
          token.isLp = true;
        }
      } catch (error) {
        // Skip if can't determine LP status
      }
    }
    
    // Process LP tokens to get pooled amounts
    const lpTokens = processedTokens.filter(t => t.isLp);
    if (lpTokens.length > 0) {
      console.log(`Processing ${lpTokens.length} LP tokens for pooled amounts`);
      const processedTokensWithLp = await processLpTokens(processedTokens, walletAddress);
      processedTokens = processedTokensWithLp;
    }
    
    // Update progress - Verifying contract data
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 5,
      totalBatches: 7,
      message: 'Verifying contract data...'
    });
    
    // Sort by value descending
    processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Update progress - Finalizing data
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 6,
      totalBatches: 7,
      message: 'Finalizing data...'
    });
    
    const endTime = Date.now();
    console.log(`Direct balance fetch completed in ${endTime - startTime}ms`);
    console.log(`Found ${processedTokens.length} tokens with non-zero balances`);
    
    // Update progress - Complete
    updateLoadingProgress({
      status: 'complete',
      currentBatch: 7,
      totalBatches: 7,
      message: 'Loading complete'
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