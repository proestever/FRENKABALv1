import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getDefaultLogo } from './blockchain-service';
import { storage } from '../storage';
import { isLiquidityPoolToken, processLpTokens } from './lp-token-service';
import { getProvider, executeWithFailover } from './rpc-provider';

// Constants
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

// Get logs with automatic failover between providers
async function getLogsWithFailover(filter: any): Promise<ethers.providers.Log[]> {
  return executeWithFailover(async (provider) => {
    return await provider.getLogs(filter);
  });
}

// Get token info (name, symbol, decimals, balance)
async function getTokenInfo(tokenAddress: string, walletAddress: string): Promise<{
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
} | null> {
  try {
    const provider = getProvider();
    const tokenContract = new ethers.Contract(tokenAddress, [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)'
    ], provider);

    // Get all data in parallel
    const [name, symbol, decimals, balance] = await Promise.all([
      tokenContract.name().catch(() => 'Unknown Token'),
      tokenContract.symbol().catch(() => 'UNKNOWN'),
      tokenContract.decimals().catch(() => 18),
      tokenContract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
    ]);

    const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));
    
    // Only return tokens with non-zero balance
    if (balanceFormatted === 0) {
      return null;
    }

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      balance: balance.toString(),
      balanceFormatted
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get token balances without prices - prices will be fetched client-side
 */
export async function getDirectTokenBalancesNoPrices(walletAddress: string): Promise<ProcessedToken[]> {
  const startTime = Date.now();
  console.log(`Getting direct token balances (no prices) for wallet: ${walletAddress}`);

  try {
    const provider = getProvider();
    
    // Log progress - Connecting
    console.log('Connecting to blockchain...');

    // Get block range
    const latestBlock = await provider.getBlockNumber();
    
    // Extended lookback to ~12 months (about 4M blocks) to catch older tokens like HEX
    // This ensures we find tokens that haven't moved in a long time
    const maxLookback = 4000000;
    const fromBlock = Math.max(0, latestBlock - maxLookback);
    
    console.log(`Scanning blocks ${fromBlock} to ${latestBlock} (${latestBlock - fromBlock} blocks)`);
    
    // Log progress - Wallet data
    console.log('Fetching wallet data...');

    // Get all Transfer events TO this wallet in chunks
    const CHUNK_SIZE = 100000;
    const chunks: { from: number; to: number }[] = [];
    
    for (let block = fromBlock; block <= latestBlock; block += CHUNK_SIZE) {
      chunks.push({
        from: block,
        to: Math.min(block + CHUNK_SIZE - 1, latestBlock)
      });
    }

    console.log(`Split into ${chunks.length} chunks of ${CHUNK_SIZE} blocks each (lookback: ~12 months to catch old tokens like HEX)`);

    // Process chunks in parallel
    const allLogs = await Promise.all(
      chunks.map(async (chunk) => {
        const filter = {
          fromBlock: chunk.from,
          toBlock: chunk.to,
          topics: [
            TRANSFER_EVENT_TOPIC,
            null,
            ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)
          ]
        };
        
        try {
          return await getLogsWithFailover(filter);
        } catch (error) {
          console.warn(`Failed to get logs for chunk ${chunk.from}-${chunk.to}:`, error);
          return [];
        }
      })
    );

    // Flatten logs array
    const logs = allLogs.flat();
    console.log(`Found ${logs.length} incoming transfer events`);

    // Get unique token addresses
    const tokenAddresses = new Set<string>();
    logs.forEach(log => {
      tokenAddresses.add(log.address.toLowerCase());
    });

    // Always check these important tokens regardless of Transfer events
    const IMPORTANT_TOKENS = [
      '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', // HEX
      '0x95b303987a60c71504d99aa1b13b4da07b0790ab', // PLSX
      '0x832396a5e87eab53e5cac200f563b7cee6032582', // INC
      '0xa1077a294dde1b09bb078844df40758a5d0f9a27', // WPLS
    ];

    IMPORTANT_TOKENS.forEach(token => {
      tokenAddresses.add(token.toLowerCase());
    });

    console.log(`Found ${tokenAddresses.size} unique tokens (including important tokens)`);

    const processedTokens: ProcessedToken[] = [];

    // Get native PLS balance
    const plsBalance = await provider.getBalance(walletAddress);
    const plsBalanceFormatted = parseFloat(ethers.utils.formatEther(plsBalance));
    
    if (plsBalanceFormatted > 0) {
      // Get stored logo for PLS
      let plsLogo = getDefaultLogo('PLS');
      try {
        const storedLogo = await storage.getTokenLogo(PLS_TOKEN_ADDRESS);
        if (storedLogo?.logoUrl) {
          plsLogo = storedLogo.logoUrl;
        }
      } catch (error) {
        // Use default
      }
      
      processedTokens.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: plsBalance.toString(),
        balanceFormatted: plsBalanceFormatted,
        price: 0, // Price will be fetched client-side
        value: 0, // Value will be calculated client-side
        logo: plsLogo,
        isNative: true,
        verified: true
      });
    }

    // Process tokens in larger batches
    const BATCH_SIZE = 50;
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
            // Get token info (no price)
            const tokenInfo = await getTokenInfo(tokenAddress, walletAddress);
            
            if (!tokenInfo) return null;
            
            // Get stored logo if available
            let logoUrl = getDefaultLogo(tokenInfo.symbol);
            try {
              const storedLogo = await storage.getTokenLogo(tokenAddress);
              if (storedLogo?.logoUrl) {
                logoUrl = storedLogo.logoUrl;
              }
            } catch (error) {
              // Use default or placeholder
              logoUrl = '/assets/100xfrenlogo.png';
            }
            
            return {
              address: tokenAddress,
              symbol: tokenInfo.symbol,
              name: tokenInfo.name,
              decimals: tokenInfo.decimals,
              balance: tokenInfo.balance,
              balanceFormatted: tokenInfo.balanceFormatted,
              price: 0, // Price will be fetched client-side
              value: 0, // Value will be calculated client-side
              logo: logoUrl,
              verified: false
            };
          } catch (error) {
            console.error(`Error processing token ${tokenAddress}:`, error);
            return null;
          }
        })
      );
      
      // Update progress
      const completedTokens = (batchIndex + 1) * BATCH_SIZE;
      const tokenProgress = Math.min((completedTokens / totalTokens) * 25, 25);
      
      console.log(`Fetching tokens... (${Math.min(completedTokens, totalTokens)}/${totalTokens})`);
      
      return batchResults.filter(result => result !== null);
    });

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Flatten results and add to processedTokens
    processedTokens.push(...batchResults.flat());

    // Log progress - Fetching LPs
    console.log('Fetching LPs...');

    // Check for LP tokens but don't fetch prices
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
      processedTokens.splice(0, processedTokens.length, ...processedTokensWithLp);
    }

    // Log progress - Complete
    console.log('Processing complete');

    const endTime = Date.now();
    console.log(`Direct balance fetch (no prices) completed in ${endTime - startTime}ms`);
    console.log(`Found ${processedTokens.length} tokens with non-zero balances`);

    return processedTokens;
  } catch (error) {
    console.error('Error getting direct token balances:', error);
    
    console.error('Error loading wallet data. Please try again.');
    
    throw error;
  }
}