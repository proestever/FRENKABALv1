import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getTokenPrice } from './api';

// Standard PulseX LP token/pair ABI (simplified to just what we need)
const LP_TOKEN_ABI = [
  // Get total supply of LP tokens
  {"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get token0 address
  {"constant":true,"inputs":[],"name":"token0","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get token1 address
  {"constant":true,"inputs":[],"name":"token1","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get reserves of both tokens
  {"constant":true,"inputs":[],"name":"getReserves","outputs":[{"name":"reserve0","type":"uint112"},{"name":"reserve1","type":"uint112"},{"name":"blockTimestampLast","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},
  // Get balanceOf - LP token balance for an address
  {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}
];

// ERC20 token ABI (simplified to just what we need)
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
 * Enhanced LP token processing with detailed token pair data
 * This function enhances the LP token with:
 * - LP token reserves
 * - User's share of the total supply
 * - Underlying token balances and values
 */
export async function processLpToken(token: ProcessedToken, walletAddress: string): Promise<ProcessedToken> {
  if (!token.isLp) {
    return token;
  }
  
  try {
    console.log(`Processing LP token: ${token.address}`);
    
    // 1. Get LP token total supply
    const totalSupply = await callContractFunction<ethers.BigNumber>(
      token.address, 
      LP_TOKEN_ABI,
      'totalSupply'
    );
    
    if (!totalSupply) {
      console.log(`Could not get total supply for LP token ${token.address}`);
      return token;
    }
    
    // 2. Get token addresses for the pair
    const [token0Address, token1Address] = await Promise.all([
      callContractFunction<string>(token.address, LP_TOKEN_ABI, 'token0'),
      callContractFunction<string>(token.address, LP_TOKEN_ABI, 'token1')
    ]);
    
    if (!token0Address || !token1Address) {
      console.log(`Could not get token addresses for LP pair ${token.address}`);
      return token;
    }
    
    // 3. Get token information (decimals, symbols, names) for both tokens
    const [
      token0Decimals, 
      token1Decimals, 
      token0Symbol, 
      token1Symbol,
      token0Name,
      token1Name
    ] = await Promise.all([
      callContractFunction<number>(token0Address, ERC20_ABI, 'decimals'),
      callContractFunction<number>(token1Address, ERC20_ABI, 'decimals'),
      callContractFunction<string>(token0Address, ERC20_ABI, 'symbol'),
      callContractFunction<string>(token1Address, ERC20_ABI, 'symbol'),
      callContractFunction<string>(token0Address, ERC20_ABI, 'name'),
      callContractFunction<string>(token1Address, ERC20_ABI, 'name')
    ]);
    
    // Convert null values to undefined for type safety
    const safeToken0Symbol = token0Symbol === null ? undefined : token0Symbol;
    const safeToken1Symbol = token1Symbol === null ? undefined : token1Symbol;
    const safeToken0Name = token0Name === null ? undefined : token0Name; 
    const safeToken1Name = token1Name === null ? undefined : token1Name;
    
    console.log(`LP Token pair: ${safeToken0Symbol || '?'}/${safeToken1Symbol || '?'}`);
    
    if (!token0Decimals || !token1Decimals) {
      console.log(`Could not get token decimals for LP pair ${token.address}`);
      return token;
    }
    
    // 4. Get reserves
    const reserves = await callContractFunction<[ethers.BigNumber, ethers.BigNumber, number]>(
      token.address,
      LP_TOKEN_ABI,
      'getReserves'
    );
    
    if (!reserves || !Array.isArray(reserves) || reserves.length !== 3) {
      console.log(`Could not get reserves for LP pair ${token.address}`);
      return token;
    }
    
    const [reserve0, reserve1] = reserves;
    
    // 5. Calculate user share - convert everything to native JS numbers for simplicity
    const userLpTokenBalance = ethers.BigNumber.from(token.balance);
    const userShareRatio = Number(ethers.utils.formatEther(userLpTokenBalance)) / 
                          Number(ethers.utils.formatEther(totalSupply));
    
    // 6. Calculate token balances based on user's share
    const token0Balance = reserve0.mul(ethers.utils.parseEther(userShareRatio.toString()))
                             .div(ethers.utils.parseEther('1')).toString();
    const token1Balance = reserve1.mul(ethers.utils.parseEther(userShareRatio.toString()))
                             .div(ethers.utils.parseEther('1')).toString();
    
    // 7. Format balances with proper decimals
    const token0BalanceFormatted = Number(ethers.utils.formatUnits(token0Balance, token0Decimals));
    const token1BalanceFormatted = Number(ethers.utils.formatUnits(token1Balance, token1Decimals));
    
    // 8. Get prices for tokens
    const [token0Price, token1Price] = await Promise.all([
      getTokenPrice(token0Address),
      getTokenPrice(token1Address)
    ]);
    
    // 9. Calculate values
    const token0Value = token0Price ? token0BalanceFormatted * token0Price.usdPrice : undefined;
    const token1Value = token1Price ? token1BalanceFormatted * token1Price.usdPrice : undefined;
    
    // 9. Calculate combined value
    const combinedValue = 
      (token0Value || 0) + (token1Value || 0);
    
    // 10. Update the token with LP details
    return {
      ...token,
      // Set symbols based on what we retrieved from the blockchain
      lpToken0Symbol: token0Symbol || token.lpToken0Symbol || '?',
      lpToken1Symbol: token1Symbol || token.lpToken1Symbol || '?',
      // Add token addresses
      lpToken0Address: token0Address,
      lpToken1Address: token1Address,
      // Add token names
      lpToken0Name: token0Name || undefined,
      lpToken1Name: token1Name || undefined,
      // Add token decimals
      lpToken0Decimals: token0Decimals,
      lpToken1Decimals: token1Decimals,
      // Add balance details
      lpToken0Balance: token0Balance,
      lpToken1Balance: token1Balance,
      lpToken0BalanceFormatted: token0BalanceFormatted,
      lpToken1BalanceFormatted: token1BalanceFormatted,
      // Add price and value data
      lpToken0Price: token0Price?.usdPrice,
      lpToken1Price: token1Price?.usdPrice,
      lpToken0Value: token0Value,
      lpToken1Value: token1Value,
      // Update the overall token value to be the sum of underlying token values
      value: combinedValue > 0 ? combinedValue : token.value,
      // Add supply and reserve data
      lpTotalSupply: totalSupply.toString(),
      lpReserve0: reserve0.toString(),
      lpReserve1: reserve1.toString()
    };
  } catch (error) {
    console.error(`Error processing LP token ${token.address}:`, error);
    return token;
  }
}

/**
 * Process multiple LP tokens in batches to avoid rate limiting
 */
export async function processLpTokens(
  tokens: ProcessedToken[], 
  walletAddress: string,
  batchSize = 5,
  delayMs = 500
): Promise<ProcessedToken[]> {
  // Find LP tokens
  const lpTokens = tokens.filter(token => token.isLp);
  const otherTokens = tokens.filter(token => !token.isLp);
  
  console.log(`Processing ${lpTokens.length} LP tokens in batches of ${batchSize}`);
  
  // Process LP tokens in batches
  const processedLpTokens: ProcessedToken[] = [];
  
  for (let i = 0; i < lpTokens.length; i += batchSize) {
    const batch = lpTokens.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(lpTokens.length / batchSize)}`);
    
    // Process batch in parallel
    const promises = batch.map(token => processLpToken(token, walletAddress));
    const results = await Promise.all(promises);
    
    processedLpTokens.push(...results);
    
    // Add delay between batches to avoid rate limiting
    if (i + batchSize < lpTokens.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // Combine LP tokens with other tokens
  return [...processedLpTokens, ...otherTokens];
}