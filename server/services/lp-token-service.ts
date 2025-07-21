import fetch from 'node-fetch';
import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getTokenPrice } from './api';
import { getTokenPriceFromContract } from './smart-contract-price-service';

/**
 * Check if a token address is a liquidity pool token by trying to call LP-specific functions
 */
export async function isLiquidityPoolToken(tokenAddress: string): Promise<boolean> {
  try {
    // Try to call token0() and token1() functions which are LP-specific
    const [token0Address, token1Address] = await Promise.all([
      callContractFunction<string>(tokenAddress, LP_TOKEN_ABI, 'token0'),
      callContractFunction<string>(tokenAddress, LP_TOKEN_ABI, 'token1')
    ]);
    
    // If both token0 and token1 return valid addresses, it's likely an LP token
    if (token0Address && token1Address && 
        ethers.utils.isAddress(token0Address) && 
        ethers.utils.isAddress(token1Address) &&
        token0Address !== token1Address) {
      return true;
    }
    
    return false;
  } catch (error) {
    // If any of the LP functions fail, it's not an LP token
    return false;
  }
}

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

// Import the new RPC provider system
import { getProvider, executeWithFailover } from './rpc-provider';

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
    return await executeWithFailover(async (provider) => {
      // Create a contract instance
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      // Add timeout to prevent hanging on bad contracts
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Contract call timeout')), 3000)
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
    
    // 5. Calculate user share - handle scientific notation properly
    let token0Balance = '0';
    let token1Balance = '0';
    
    try {
      const userLpTokenBalance = ethers.BigNumber.from(token.balance);
      
      // Convert to decimal strings first to avoid scientific notation issues
      const userBalanceDecimal = ethers.utils.formatEther(userLpTokenBalance);
      const totalSupplyDecimal = ethers.utils.formatEther(totalSupply);
      
      // Parse as regular numbers for the ratio calculation
      const userBalanceNumber = parseFloat(userBalanceDecimal);
      const totalSupplyNumber = parseFloat(totalSupplyDecimal);
      
      // Calculate the share ratio
      const userShareRatio = userBalanceNumber / totalSupplyNumber;
      
      // Handle very small numbers by using a string representation instead of scientific notation
      let ratioString = userShareRatio.toString();
      
      // If scientific notation is present, convert to a regular decimal string
      if (ratioString.includes('e-')) {
        const match = ratioString.match(/^(\d)\.?(\d*)e-(\d+)$/);
        if (match) {
          const digit = match[1];
          const decimal = match[2] || '';
          const zeros = parseInt(match[3], 10) - 1;
          ratioString = '0.' + '0'.repeat(zeros) + digit + decimal;
        }
      }
      
      // Truncate to max 18 decimal places (parseEther limit)
      const decimalIndex = ratioString.indexOf('.');
      if (decimalIndex !== -1) {
        const decimalPlaces = ratioString.length - decimalIndex - 1;
        if (decimalPlaces > 18) {
          ratioString = ratioString.substring(0, decimalIndex + 19); // +1 for dot, +18 for decimals
        }
      }
      
      // 6. Calculate token balances based on user's share
      token0Balance = reserve0.mul(ethers.utils.parseEther(ratioString))
                               .div(ethers.utils.parseEther('1')).toString();
      token1Balance = reserve1.mul(ethers.utils.parseEther(ratioString))
                               .div(ethers.utils.parseEther('1')).toString();
    } catch (error) {
      console.error(`Error calculating LP token shares for ${token.address}:`, error);
      // Continue with default values if there's an error
    }
    
    // 7. Format balances with proper decimals
    const token0BalanceFormatted = Number(ethers.utils.formatUnits(token0Balance, token0Decimals));
    const token1BalanceFormatted = Number(ethers.utils.formatUnits(token1Balance, token1Decimals));
    
    // 8. Get prices for tokens using smart contract service
    const [token0PriceData, token1PriceData] = await Promise.all([
      getTokenPriceFromContract(token0Address),
      getTokenPriceFromContract(token1Address)
    ]);
    
    // Convert to API format for compatibility
    const token0Price = token0PriceData ? { usdPrice: token0PriceData.price } : null;
    const token1Price = token1PriceData ? { usdPrice: token1PriceData.price } : null;
    
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
      lpToken0Symbol: safeToken0Symbol || token.lpToken0Symbol || '?',
      lpToken1Symbol: safeToken1Symbol || token.lpToken1Symbol || '?',
      // Add token addresses
      lpToken0Address: token0Address,
      lpToken1Address: token1Address,
      // Add token names
      lpToken0Name: safeToken0Name,
      lpToken1Name: safeToken1Name,
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
  batchSize = 20,
  delayMs = 0
): Promise<ProcessedToken[]> {
  // Find LP tokens
  const lpTokens = tokens.filter(token => token.isLp);
  const otherTokens = tokens.filter(token => !token.isLp);
  
  // Process all LP tokens in parallel for maximum speed
  console.log(`Processing all ${lpTokens.length} LP tokens in parallel`);
  const processedLpTokens = await Promise.all(
    lpTokens.map(token => processLpToken(token, walletAddress))
  );
  
  // Combine LP tokens with other tokens
  return [...processedLpTokens, ...otherTokens];
}