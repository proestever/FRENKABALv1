import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getTokenPrice } from './api';
import { getProvider, executeWithFailover } from './rpc-provider';


// Standard ERC20 ABI
const ERC20_ABI = [
  // Get token decimals
  {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get token symbol
  {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get token name
  {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get balance of address
  {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}
];

// Native PLS constants
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Get default token logo for common tokens
 */
export function getDefaultLogo(symbol: string | null | undefined): string | null {
  if (!symbol) {
    return null;
  }

  const symbolLower = symbol.toLowerCase();
  // Updated with application-specific path for PLS
  const defaultLogos: Record<string, string> = {
    pls: '/assets/pls-logo-trimmed.png', // Use our local, trimmed PLS logo
    hex: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2469.png',
    phex: 'https://cryptologos.cc/logos/hex-hex-logo.png',
    peth: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    pbnb: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
    dai: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png', // DAI logo
    pdai: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png', // pDAI logo
  };
  
  return defaultLogos[symbolLower] || null;
}

/**
 * Call a contract function using ethers.js with failover support
 */
async function callContractFunction<T>(
  contractAddress: string,
  abi: any[],
  functionName: string,
  params: any[] = []
): Promise<T | null> {
  try {
    return await executeWithFailover(async (provider) => {
      // Create a contract instance
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      // Add timeout to prevent hanging on bad contracts
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Contract call timeout')), 5000)
      );
      
      // Call the function with timeout
      const result = await Promise.race([
        contract[functionName](...params),
        timeoutPromise
      ]) as T;
      
      return result;
    });
  } catch (error: any) {
    // Only log errors that aren't expected (execution reverted is expected for non-LP tokens)
    if (!error.message?.includes('execution reverted') && 
        !error.message?.includes('Contract call timeout')) {
      console.error(`Error calling ${functionName} on ${contractAddress}:`, error.message);
    }
    return null;
  }
}

/**
 * Get native PLS balance directly from the blockchain
 */
export async function getNativePlsBalanceFromChain(walletAddress: string): Promise<{balance: string, balanceFormatted: number} | null> {
  try {
    console.log(`Fetching native PLS balance for ${walletAddress} directly from blockchain`);
    
    // Query the blockchain directly for this wallet's balance
    const balanceWei = await executeWithFailover(async (provider) => {
      return await provider.getBalance(walletAddress);
    });
    
    if (!balanceWei) {
      console.log('Could not get balance from blockchain');
      return null;
    }
    
    // Format the balance from wei to PLS
    const balanceFormatted = parseFloat(ethers.utils.formatUnits(balanceWei, PLS_DECIMALS));
    console.log(`Native PLS balance for ${walletAddress}: ${balanceFormatted} PLS (raw: ${balanceWei.toString()})`);
    
    return {
      balance: balanceWei.toString(),
      balanceFormatted
    };
  } catch (error) {
    console.error('Error fetching native PLS balance from blockchain:', error);
    return null;
  }
}

/**
 * Get token balance directly from the blockchain
 */
export async function getTokenBalanceFromChain(walletAddress: string, tokenAddress: string): Promise<ProcessedToken | null> {
  try {
    console.log(`Fetching token balance for ${tokenAddress} in wallet ${walletAddress} directly from blockchain`);
    
    // Get token balance first - if it's zero, we can skip the rest
    const balance = await callContractFunction<ethers.BigNumber>(
      tokenAddress, 
      ERC20_ABI, 
      'balanceOf',
      [walletAddress]
    );
    
    if (balance === null) {
      console.log(`Could not get balance for token ${tokenAddress}`);
      return null;
    }
    
    // Skip token if balance is zero
    if (balance.isZero()) {
      console.log(`Zero balance for token ${tokenAddress}`);
      return null;
    }
    
    // Get token decimals
    const decimals = await callContractFunction<number>(tokenAddress, ERC20_ABI, 'decimals');
    if (decimals === null) {
      console.log(`Could not get decimals for token ${tokenAddress}`);
      return null;
    }
    
    // Calculate formatted balance
    const balanceString = balance.toString();
    const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));
    
    // If balance after formatting is too small (dust), skip it
    const DUST_THRESHOLD = 0.000001; // Adjust as needed
    if (balanceFormatted < DUST_THRESHOLD) {
      console.log(`Dust balance (${balanceFormatted}) for token ${tokenAddress}, skipping`);
      return null;
    }
    
    // Get token symbol
    const symbol = await callContractFunction<string>(tokenAddress, ERC20_ABI, 'symbol');
    if (symbol === null) {
      console.log(`Could not get symbol for token ${tokenAddress}`);
      return null;
    }
    
    // Get token name
    const name = await callContractFunction<string>(tokenAddress, ERC20_ABI, 'name');
    if (name === null) {
      console.log(`Could not get name for token ${tokenAddress}`);
      return null;
    }
    
    console.log(`Got balance for ${symbol}: ${balanceFormatted}`);
    
    // Try to get price data using multiple methods
    let price: number | undefined = undefined;
    let value: number | undefined = undefined;
    let priceChange24h: number | undefined = undefined;
    let exchange: string | undefined = undefined;
    
    try {
      // First try getting price from Moralis
      const priceData = await getTokenPrice(tokenAddress);
      if (priceData && priceData.usdPrice && priceData.usdPrice > 0) {
        price = priceData.usdPrice;
        value = price * balanceFormatted;
        priceChange24h = priceData.usdPrice24hrPercentChange || 0;
        exchange = priceData.exchangeName || 'Unknown';
        console.log(`Got price for ${symbol} from Moralis: $${price}`);
      } else {
        // If Moralis doesn't have a price, try to get from DexScreener
        try {
          const dexScreenerData: any = await fetch(`/api/token-price-dexscreener/${tokenAddress}`).then(r => r.json());
          if (dexScreenerData && dexScreenerData.usdPrice && dexScreenerData.usdPrice > 0) {
            const dexPrice = dexScreenerData.usdPrice;
            price = dexPrice;
            value = dexPrice * balanceFormatted;
            priceChange24h = dexScreenerData.usdPrice24hrPercentChange || 0;
            exchange = dexScreenerData.exchangeName || 'DexScreener';
            console.log(`Got price for ${symbol} from DexScreener: $${dexPrice}`);
          }
        } catch (dexError) {
          console.log(`Could not get price from DexScreener for ${tokenAddress}`);
        }
      }
    } catch (priceError: any) {
      console.log(`Could not get price for token ${tokenAddress}: ${priceError.message || "Unknown error"}`);
    }
    
    // Even if we couldn't get a price, still return the token with the balance
    return {
      address: tokenAddress,
      symbol,
      name,
      decimals,
      balance: balanceString,
      balanceFormatted,
      price,
      value: price && price > 0 ? price * balanceFormatted : 0,
      priceChange24h,
      logo: getDefaultLogo(symbol) || undefined,
      exchange,
      verified: false // We don't have verification status when querying directly
    };
  } catch (error) {
    console.error(`Error fetching token balance for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Process a batch of token addresses to get their balances directly from the blockchain
 */
export async function batchGetTokenBalancesFromChain(
  walletAddress: string,
  tokenAddresses: string[],
  batchSize = 5,
  delayMs = 300
): Promise<ProcessedToken[]> {
  const tokens: ProcessedToken[] = [];
  const totalBatches = Math.ceil(tokenAddresses.length / batchSize);
  
  console.log(`Processing ${tokenAddresses.length} tokens in ${totalBatches} batches`);
  
  // Process tokens in batches to avoid overloading the RPC
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    console.log(`Processing batch ${currentBatch}/${totalBatches}`);
    // Silent loading - no progress updates
    
    // Process tokens in parallel within the batch
    const batchPromises = batch.map(tokenAddress => 
      getTokenBalanceFromChain(walletAddress, tokenAddress)
    );
    
    // Wait for all promises in this batch
    const batchResults = await Promise.all(batchPromises);
    
    // Filter out null results and add valid tokens
    for (const token of batchResults) {
      if (token) {
        tokens.push(token);
      }
    }
    
    // Add a delay between batches
    if (i + batchSize < tokenAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return tokens;
}

/**
 * Get all token balances for a wallet by checking against a known token list
 * This function is faster than scanning for events, but may miss tokens not in the list
 */
export async function getTokenBalancesFromList(
  walletAddress: string,
  knownTokenAddresses: string[]
): Promise<ProcessedToken[]> {
  try {
    console.log(`Fetching ${knownTokenAddresses.length} potential token balances from blockchain`);
    
    // Get native PLS balance first
    const plsBalance = await getNativePlsBalanceFromChain(walletAddress);
    
    // Set up tokens array with PLS if we have a balance
    const tokens: ProcessedToken[] = [];
    
    if (plsBalance) {
      try {
        // Get PLS price as well
        const plsPriceData = await getTokenPrice(PLS_TOKEN_ADDRESS);
        
        tokens.push({
          address: PLS_TOKEN_ADDRESS,
          symbol: 'PLS',
          name: 'PulseChain',
          decimals: PLS_DECIMALS,
          balance: plsBalance.balance,
          balanceFormatted: plsBalance.balanceFormatted,
          price: plsPriceData?.usdPrice,
          value: plsBalance.balanceFormatted * (plsPriceData?.usdPrice || 0),
          priceChange24h: plsPriceData?.usdPrice24hrPercentChange,
          logo: getDefaultLogo('PLS') || undefined,
          isNative: true,
          verified: true
        });
      } catch (plsError) {
        console.error('Error getting PLS price:', plsError);
      }
    }
    
    // Get ERC20 token balances from the known list
    const erc20Tokens = await batchGetTokenBalancesFromChain(walletAddress, knownTokenAddresses);
    
    // Combine with PLS token
    return [...tokens, ...erc20Tokens];
  } catch (error) {
    console.error('Error fetching token balances from list:', error);
    return [];
  }
}

// PulseChain's most common tokens to check first for optimization
export const PULSECHAIN_COMMON_TOKENS = [
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', // HEX
  '0x9a43aaa7848d5ac97c4446df5bc6f710a4e3e61a', // PLSD
  '0x57fde0a71132198a753e219d3222dab32bc880be', // PLSX
  '0x8f91fcb8d4db6e94ca8e2c8c1aa0c44b363da8fd', // INC
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27', // WPLS
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab', // PHIAT
  '0x2fa878cd830c5d7ae189b278cd5f53b8bd20de5a', // USDT (Tether) on PulseChain
  '0xe17d5708db916a0c3d74d5a2a716050853c7c07a', // PLSB
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on PulseChain
  '0xefD766cCb38EaF1dfd701853BFCe31359239F305', // DAI on PulseChain
  '0x430a7e76aa1c05a6a635d088f616a104b26e4fc4', // HDRN
  '0x6b175474e89094c44da98b954eedeac495271d0f' // DAI (Ethereum copied)
];

/**
 * Get token transfer events to discover all tokens a wallet has interacted with
 * This scans the blockchain for historical token transfers to/from this wallet
 */
export async function getTokenTransferEvents(walletAddress: string, maxBlocks: number = 20000): Promise<string[]> {
  try {
    console.log(`Scanning for token transfer events for ${walletAddress}`);
    // Silent loading - no progress updates

    // Get current block number
    const currentBlock = await executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
    
    // Limit how far back we scan to be more efficient and focus on recent tokens
    // For a real-time update after a swap, recent blocks are most important
    const fromBlock = Math.max(0, currentBlock - maxBlocks); 
    
    console.log(`Scanning from block ${fromBlock} to ${currentBlock}`);
    
    // Define transfer event topic (keccak256 hash of Transfer(address,address,uint256))
    const transferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    
    // Get transfer events where this wallet is the recipient
    // Silent loading - no progress updates
    
    const incomingLogs = await executeWithFailover(async (provider) => {
      return await provider.getLogs({
        fromBlock,
        toBlock: 'latest',
        topics: [transferEventTopic, null, ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)],
      });
    });
    
    // Get transfer events where this wallet is the sender
    // Silent loading - no progress updates
    
    const outgoingLogs = await executeWithFailover(async (provider) => {
      return await provider.getLogs({
        fromBlock,
        toBlock: 'latest',
        topics: [transferEventTopic, ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)],
      });
    });
    
    // Combine logs and extract unique token contract addresses
    const logs = [...incomingLogs, ...outgoingLogs];
    
    // Count the frequency of each token address to prioritize the most used tokens
    const tokenFrequency: Record<string, number> = {};
    
    logs.forEach(log => {
      if (log.address) {
        const addr = log.address.toLowerCase();
        tokenFrequency[addr] = (tokenFrequency[addr] || 0) + 1;
      }
    });
    
    // Convert to array of [address, frequency] pairs and sort by frequency
    const sortedTokens = Object.entries(tokenFrequency)
      .sort((a, b) => b[1] - a[1]) // Sort by frequency, most frequent first
      .map(([address]) => address);
    
    // Limit to the most active tokens (max 30) to keep the response time fast
    const MAX_TOKENS = 30;
    const prioritizedTokens = sortedTokens.slice(0, MAX_TOKENS);
    
    console.log(`Found ${sortedTokens.length} unique token contracts from transfer events, using top ${prioritizedTokens.length}`);
    return prioritizedTokens;
  } catch (error) {
    console.error('Error getting token transfer events:', error);
    return [];
  }
}

/**
 * Get all token balances for a wallet by directly querying the blockchain
 * This is faster than waiting for APIs to update after a swap
 */
export async function getDirectTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    // First, check balances of common tokens (fast)
    const commonTokens = await getTokenBalancesFromList(walletAddress, PULSECHAIN_COMMON_TOKENS);
    
    console.log(`Found ${commonTokens.length} common tokens with balances`);
    
    // Next, scan for transfer events to find all token contracts the wallet has interacted with
    const tokenAddresses = await getTokenTransferEvents(walletAddress);
    
    // Filter out common tokens we already checked to avoid duplicates
    const commonTokenAddresses = new Set(PULSECHAIN_COMMON_TOKENS.map(addr => addr.toLowerCase()));
    const additionalTokenAddresses = tokenAddresses.filter(addr => !commonTokenAddresses.has(addr));
    
    console.log(`Checking additional ${additionalTokenAddresses.length} tokens found from transfer events`);
    
    // Get balances for additional tokens
    const additionalTokens = await batchGetTokenBalancesFromChain(walletAddress, additionalTokenAddresses);
    
    console.log(`Found ${additionalTokens.length} additional tokens with balances`);
    
    // Combine results
    return [...commonTokens, ...additionalTokens];
  } catch (error) {
    console.error('Error getting direct token balances:', error);
    // Fall back to just the common tokens if the event scanning fails
    return getTokenBalancesFromList(walletAddress, PULSECHAIN_COMMON_TOKENS);
  }
}