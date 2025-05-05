import { 
  ProcessedToken, 
  WalletData, 
  Transaction
} from '../types';
import { InsertTokenLogo } from '@shared/schema';
import { storage } from '../storage';
import { updateLoadingProgress } from '../routes';
import * as moralisService from './moralis';
import Moralis from 'moralis';

/**
 * Get full wallet data including token balances and prices
 * @param walletAddress The wallet address to fetch data for
 * @param page Page number for pagination (1-based)
 * @param limit Number of tokens per page
 */
export async function getWalletData(
  walletAddress: string, 
  page: number = 1, 
  limit: number = 100
): Promise<WalletData> {
  try {
    // Normalize the wallet address to lowercase
    walletAddress = walletAddress.toLowerCase();
    
    // Initialize response structure
    const response: WalletData = {
      address: walletAddress,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: null,
      plsPriceChange: null,
      networkCount: 0,
    };
    
    // Update loading progress
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 9, // We'll break this into 9 distinct steps
      message: 'Fetching wallet balances...'
    });
    
    // Step 1: Get wallet token balances from Moralis
    let tokenBalances: ProcessedToken[] = [];
    try {
      const moralisTokens = await moralisService.getWalletTokenBalances(walletAddress);
      
      updateLoadingProgress({
        currentBatch: 2,
        totalBatches: 9,
        message: 'Processing token data...'
      });
      
      // Step 2: Process tokens in batches
      const BATCH_SIZE = 15;
      const totalBatches = Math.ceil(moralisTokens.length / BATCH_SIZE);
      
      for (let i = 0; i < moralisTokens.length; i += BATCH_SIZE) {
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        const batchTokens = moralisTokens.slice(i, i + BATCH_SIZE);
        
        console.log(`Processing token batch ${currentBatch}/${totalBatches}, size: ${batchTokens.length}`);
        
        updateLoadingProgress({
          currentBatch: 2 + currentBatch,
          totalBatches: 9 + totalBatches - 1, // Adjust total batches to include token batches
          message: `Processing token batch ${currentBatch}/${totalBatches}...`
        });
        
        // Process each token in the batch
        const processedBatchTokens = await Promise.all(batchTokens.map(async (token) => {
          try {
            // Look up token logo in our database first
            let logoUrl = null;
            const storedLogo = await storage.getTokenLogo(token.token_address);
            
            if (storedLogo) {
              logoUrl = storedLogo.logoUrl;
            } else {
              // Use default logo or Moralis logo
              logoUrl = token.logo || moralisService.getDefaultLogo(token.symbol);
              
              // Save the logo for future use
              const newLogo: InsertTokenLogo = {
                tokenAddress: token.token_address,
                logoUrl,
                symbol: token.symbol,
                name: token.name,
                lastUpdated: new Date().toISOString()
              };
              
              await storage.saveTokenLogo(newLogo);
            }
            
            // Process the token data
            return moralisService.processTokenData(token, logoUrl);
          } catch (error) {
            console.error(`Error processing token ${token.token_address}:`, error);
            return null;
          }
        }));
        
        // Add valid tokens to our array
        tokenBalances.push(...processedBatchTokens.filter(Boolean) as ProcessedToken[]);
        
        // Add a delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < moralisTokens.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error('Error fetching token balances:', error);
    }
    
    // Step 3: Ensure we have the native PLS token
    updateLoadingProgress({
      currentBatch: 6,
      totalBatches: 9,
      message: 'Checking native balance...'
    });
    
    // Check if we already have PLS in our token balances
    let plsToken = tokenBalances.find(token => 
      token.isNative === true || 
      token.symbol?.toUpperCase() === 'PLS' ||
      token.address?.toLowerCase() === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()
    );
    
    // If PLS token not found, fetch native balance directly
    if (!plsToken) {
      try {
        const nativeBalance = await moralisService.getNativeBalance(walletAddress);
        const plsPrice = await moralisService.getWrappedTokenPrice(
          moralisService.WPLS_CONTRACT_ADDRESS, 
          'PLS', 
          'PulseChain'
        );
        
        if (nativeBalance) {
          const usdPrice = plsPrice?.usdPrice || 0;
          const priceChange24h = plsPrice?.usdPrice24hrPercentChange || 0;
          
          plsToken = {
            address: moralisService.PLS_TOKEN_ADDRESS,
            symbol: 'PLS',
            name: 'PulseChain',
            decimals: 18,
            balance: nativeBalance.balance,
            balanceFormatted: nativeBalance.balanceFormatted,
            price: usdPrice,
            value: nativeBalance.balanceFormatted * usdPrice,
            priceChange24h,
            logo: moralisService.getDefaultLogo('PLS'),
            exchange: 'PulseX',
            verified: true,
            isNative: true
          };
          
          tokenBalances.push(plsToken);
          console.log(`Added native PLS token with balance ${nativeBalance.balanceFormatted}`);
        }
      } catch (error) {
        console.error('Error fetching native PLS balance:', error);
      }
    }
    
    // Step 4: Calculate total portfolio value and sort tokens by value
    updateLoadingProgress({
      currentBatch: 7,
      totalBatches: 9,
      message: 'Calculating portfolio value...'
    });
    
    // Calculate token values (price * balance)
    tokenBalances = tokenBalances.map(token => {
      // If the token has a price, calculate its value
      if (token.price && token.balanceFormatted) {
        token.value = token.price * token.balanceFormatted;
      } else {
        token.value = 0;
      }
      return token;
    });
    
    // Calculate total value
    response.totalValue = tokenBalances.reduce((total, token) => {
      return total + (token.value || 0);
    }, 0);
    
    // Sort tokens by value (highest first)
    tokenBalances.sort((a, b) => {
      const valueA = a.value || 0;
      const valueB = b.value || 0;
      return valueB - valueA;
    });
    
    // Log the top tokens by value for debugging
    console.log('Top tokens sorted by value:');
    tokenBalances.slice(0, 3).forEach((token, index) => {
      console.log(`Token ${index + 1}: ${token.symbol} = $${token.value?.toFixed(2)} (balance: ${token.balanceFormatted?.toFixed(4)})`);
    });
    
    // Step 5: Apply pagination if requested
    updateLoadingProgress({
      currentBatch: 8,
      totalBatches: 9,
      message: 'Preparing response data...'
    });
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const totalItems = tokenBalances.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    // Apply pagination to the tokens (if limit is not 0)
    const paginatedTokens = limit === 0 ? tokenBalances : tokenBalances.slice(startIndex, endIndex);
    
    // Set response data
    response.tokens = paginatedTokens;
    response.tokenCount = totalItems;
    
    // Set PLS specific data (for UI elements)
    if (plsToken) {
      response.plsBalance = plsToken.balanceFormatted;
      response.plsPriceChange = plsToken.priceChange24h;
    }
    
    // Set network count (always 1 for PulseChain in this case)
    response.networkCount = 1;
    
    // Add pagination info if relevant
    if (limit > 0 && totalItems > limit) {
      response.pagination = {
        page,
        limit,
        totalItems,
        totalPages
      };
      
      console.log(`Pagination: page ${page}, limit ${limit}, showing tokens ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}`);
    }
    
    // Step 6: Complete loading
    updateLoadingProgress({
      currentBatch: 9,
      totalBatches: 9,
      status: 'complete',
      message: 'Data loaded successfully'
    });
    
    return response;
  } catch (error) {
    console.error('Error in getWalletData:', error);
    
    // Update loading progress to show error
    updateLoadingProgress({
      status: 'error',
      message: `Error loading wallet data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    
    // Return basic structure with empty data
    return {
      address: walletAddress,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: null,
      plsPriceChange: null,
      networkCount: 0
    };
  }
}

/**
 * Get wallet transaction history
 */
export async function getWalletTransactions(
  walletAddress: string,
  limit: number = 100,
  cursor: string | null = null
): Promise<{
  result: Transaction[];
  cursor: string | null;
  total: number;
}> {
  try {
    walletAddress = walletAddress.toLowerCase();
    
    // Get transaction history using Moralis SDK
    const transactionHistory = await moralisService.getTransactionHistory(
      walletAddress, 
      limit, 
      cursor
    );
    
    // Process and return transaction data
    return {
      result: transactionHistory.result as Transaction[],
      cursor: transactionHistory.cursor || null,
      total: transactionHistory.total || transactionHistory.result.length
    };
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    
    return {
      result: [],
      cursor: null,
      total: 0
    };
  }
}

/**
 * Get token price information
 */
export async function getTokenPriceInfo(tokenAddress: string) {
  try {
    return await moralisService.getTokenPrice(tokenAddress);
  } catch (error) {
    console.error(`Error fetching token price info for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get batch token prices for multiple tokens
 */
export async function getBatchTokenPrices(tokenAddresses: string[]) {
  try {
    // Normalize addresses to lowercase
    const normalizedAddresses = tokenAddresses.map(addr => addr.toLowerCase());
    
    // Remove duplicates
    const uniqueAddresses = [...new Set(normalizedAddresses)];
    
    // Get prices
    return await moralisService.batchGetTokenPrices(uniqueAddresses);
  } catch (error) {
    console.error('Error fetching batch token prices:', error);
    return {};
  }
}

/**
 * Get specific token balance for a wallet
 */
export async function getSpecificTokenBalance(walletAddress: string, tokenAddress: string): Promise<ProcessedToken | null> {
  try {
    walletAddress = walletAddress.toLowerCase();
    tokenAddress = tokenAddress.toLowerCase();
    
    console.log(`Fetching specific token balance for ${tokenAddress} in wallet ${walletAddress}`);
    
    // Special case for native token
    if (tokenAddress === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()) {
      try {
        // Get native balance directly
        const nativeBalance = await moralisService.getNativeBalance(walletAddress);
        const plsPrice = await moralisService.getWrappedTokenPrice(
          moralisService.WPLS_CONTRACT_ADDRESS, 
          'PLS', 
          'PulseChain'
        );
        
        if (nativeBalance) {
          const usdPrice = plsPrice?.usdPrice || 0;
          const priceChange24h = plsPrice?.usdPrice24hrPercentChange || 0;
          
          return {
            address: moralisService.PLS_TOKEN_ADDRESS,
            symbol: 'PLS',
            name: 'PulseChain',
            decimals: 18,
            balance: nativeBalance.balance,
            balanceFormatted: nativeBalance.balanceFormatted,
            price: usdPrice,
            value: nativeBalance.balanceFormatted * usdPrice,
            priceChange24h,
            logo: moralisService.getDefaultLogo('PLS'),
            exchange: 'PulseX',
            verified: true,
            isNative: true
          };
        }
      } catch (error) {
        console.error('Error fetching native token balance:', error);
      }
    }
    
    // For ERC20 tokens, we'll try to use the token metadata + balance APIs
    try {
      // First get the token metadata
      const tokenMetadata = await moralisService.getTokenMetadata(tokenAddress);
      
      if (!tokenMetadata) {
        return null;
      }
      
      // Then get its balance for this wallet
      const response = await Moralis.EvmApi.token.getWalletTokenBalances({
        chain: moralisService.PULSECHAIN_CHAIN_ID,
        address: walletAddress,
        tokenAddresses: [tokenAddress]
      });
      
      if (!response || !response.raw || response.raw.length === 0) {
        // Token exists but wallet has no balance
        return {
          address: tokenAddress,
          symbol: tokenMetadata.symbol,
          name: tokenMetadata.name,
          decimals: parseInt(tokenMetadata.decimals),
          balance: '0',
          balanceFormatted: 0,
          price: 0, // We'll get price separately
          value: 0,
          logo: await getTokenLogoUrl(tokenAddress),
          exchange: '',
          verified: !!tokenMetadata.verified_contract,
          isNative: false
        };
      }
      
      // Get token balance from response
      const tokenBalance = response.raw[0];
      
      // Get token price
      const priceData = await getTokenPriceInfo(tokenAddress);
      
      // Format the token data
      return {
        address: tokenAddress,
        symbol: tokenBalance.symbol,
        name: tokenBalance.name,
        decimals: parseInt(tokenBalance.decimals),
        balance: tokenBalance.balance,
        balanceFormatted: parseFloat(tokenBalance.balance_formatted || '0'),
        price: priceData?.usdPrice || 0,
        value: (parseFloat(tokenBalance.balance_formatted || '0') * (priceData?.usdPrice || 0)),
        priceChange24h: priceData?.usdPrice24hrPercentChange,
        logo: await getTokenLogoUrl(tokenAddress),
        exchange: priceData?.exchangeName || '',
        verified: !!tokenBalance.verified_contract,
        isNative: false
      };
    } catch (error) {
      console.error(`Error fetching token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.error(`Error in getSpecificTokenBalance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Helper function to get token logo URL from storage or default
 */
async function getTokenLogoUrl(tokenAddress: string): Promise<string> {
  try {
    // Check if we have the logo in our database
    const storedLogo = await storage.getTokenLogo(tokenAddress);
    
    if (storedLogo) {
      return storedLogo.logoUrl;
    }
    
    // If not, return default logo based on token
    if (tokenAddress.toLowerCase() === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()) {
      return moralisService.getDefaultLogo('PLS');
    }
    
    // Return generic default
    return '/assets/100xfrenlogo.png';
  } catch (error) {
    console.error(`Error getting token logo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return '/assets/100xfrenlogo.png';
  }
}