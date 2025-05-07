import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getTokenPrice } from './api';
import { updateLoadingProgress } from '../routes';

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

// Store RPC endpoint here - could be moved to env variables
const RPC_ENDPOINT = 'https://rpc-pulsechain.g4mm4.io';

// Native PLS constants
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

// Initialize ethers provider
const provider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINT);

/**
 * Call a contract function using ethers.js
 */
async function callContractFunction<T>(
  contractAddress: string,
  abi: any[],
  functionName: string,
  params: any[] = []
): Promise<T | null> {
  try {
    // Create a contract instance
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Call the function
    const result = await contract[functionName](...params) as T;
    return result;
  } catch (error) {
    console.error(`Error calling ${functionName} on ${contractAddress}:`, error);
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
    const balanceWei = await provider.getBalance(walletAddress);
    
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
    
    // Get token decimals
    const decimals = await callContractFunction<number>(tokenAddress, ERC20_ABI, 'decimals');
    if (decimals === null) {
      console.log(`Could not get decimals for token ${tokenAddress}`);
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
    
    // Get token balance
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
    
    const balanceString = balance.toString();
    const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));
    
    // If balance is 0, return null
    if (balanceFormatted === 0) {
      console.log(`Zero balance for token ${tokenAddress}`);
      return null;
    }
    
    console.log(`Got balance for ${symbol}: ${balanceFormatted}`);
    
    // Try to get price data
    let price: number | undefined = undefined;
    let value: number | undefined = undefined;
    let priceChange24h: number | undefined = undefined;
    
    try {
      const priceData = await getTokenPrice(tokenAddress);
      if (priceData) {
        price = priceData.usdPrice || 0;
        value = price * balanceFormatted;
        priceChange24h = priceData.usdPrice24hrPercentChange || 0;
      }
    } catch (priceError: any) {
      console.log(`Could not get price for token ${tokenAddress}: ${priceError.message || "Unknown error"}`);
    }
    
    return {
      address: tokenAddress,
      symbol,
      name,
      decimals,
      balance: balanceString,
      balanceFormatted,
      price,
      value,
      priceChange24h,
      logo: getDefaultLogo(symbol),
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
    updateLoadingProgress({
      status: 'loading',
      message: `Fetching token balances from blockchain (batch ${currentBatch}/${totalBatches})...`,
      currentBatch,
      totalBatches
    });
    
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
          logo: getDefaultLogo('PLS'),
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

// PulseChain's most common tokens (example list - this would ideally be more comprehensive)
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
 * Get all token balances for a wallet by directly querying the blockchain
 * This is faster than waiting for APIs to update after a swap
 */
export async function getDirectTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  // In a real implementation, this list would be much more comprehensive
  // or would scan for transfer events to discover tokens
  return getTokenBalancesFromList(walletAddress, PULSECHAIN_COMMON_TOKENS);
}