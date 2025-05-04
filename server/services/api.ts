import fetch from 'node-fetch';
import Moralis from 'moralis';
import { 
  ProcessedToken, 
  PulseChainTokenBalanceResponse, 
  PulseChainTokenBalance,
  PulseChainAddressResponse, 
  MoralisTokenPriceResponse, 
  MoralisWalletTokenBalancesResponse,
  WalletData 
} from '../types';
import { storage } from '../storage';
import { InsertTokenLogo } from '@shared/schema';
import { updateLoadingProgress } from '../routes';

// Initialize Moralis
try {
  Moralis.start({
    apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImVkN2E1ZDg1LTBkOWItNGMwYS1hZjgxLTc4MGJhNTdkNzllYSIsIm9yZ0lkIjoiNDI0Nzk3IiwidXNlcklkIjoiNDM2ODk0IiwidHlwZUlkIjoiZjM5MGFlMWYtNGY3OC00MzViLWJiNmItZmVhODMwNTdhMzAzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYzOTQ2MzgsImV4cCI6NDg5MjE1NDYzOH0.AmaeD5gXY-0cE-LAGH6TTucbI6AxQ5eufjqXKMc_u98"
  });
  console.log("Moralis initialized successfully");
} catch (error) {
  console.error("Failed to initialize Moralis:", error);
}

// Constants
const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImVkN2E1ZDg1LTBkOWItNGMwYS1hZjgxLTc4MGJhNTdkNzllYSIsIm9yZ0lkIjoiNDI0Nzk3IiwidXNlcklkIjoiNDM2ODk0IiwidHlwZUlkIjoiZjM5MGFlMWYtNGY3OC00MzViLWJiNmItZmVhODMwNTdhMzAzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYzOTQ2MzgsImV4cCI6NDg5MjE1NDYzOH0.AmaeD5gXY-0cE-LAGH6TTucbI6AxQ5eufjqXKMc_u98';
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // PulseChain native token is 0xeee...eee 
const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'; // wPLS contract - used for price
const PLS_CONTRACT_ADDRESS = '0x5616458eb2bAc88dD60a4b08F815F37335215f9B'; // Alternative PLS contract address
const PLS_DECIMALS = 18; // Native PLS has 18 decimals
const PLS_PRICE_USD_FALLBACK = 0.000020; // Fallback price only if all APIs fail

// Note: Moralis is already initialized at the top of the file

/**
 * Get native PLS balance for a wallet address directly from PulseChain Scan API
 */
export async function getNativePlsBalance(walletAddress: string): Promise<{balance: string, balanceFormatted: number} | null> {
  try {
    console.log(`Fetching native PLS balance for ${walletAddress} from PulseChain Scan API`);
    
    // Using the direct address endpoint which includes the native PLS balance
    const response = await fetch(`${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}`);
    
    if (!response.ok) {
      console.log(`PulseChain API response status for native balance: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json() as PulseChainAddressResponse;
    
    // Extract the coin balance which represents native PLS
    const coinBalance = data.coin_balance;
    if (coinBalance === undefined) {
      console.log('Could not find coin_balance in PulseChain Scan API response');
      return null;
    }
    
    // Format the balance from wei to PLS (divide by 10^18)
    const balanceFormatted = parseFloat(coinBalance) / Math.pow(10, PLS_DECIMALS);
    console.log(`Native PLS balance for ${walletAddress}: ${balanceFormatted} PLS (raw: ${coinBalance})`);
    
    return {
      balance: coinBalance,
      balanceFormatted
    };
  } catch (error) {
    console.error('Error fetching native PLS balance:', error);
    return null;
  }
}

/**
 * Get token balances for a wallet address from PulseChain Scan API
 */
export async function getTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    const response = await fetch(`${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}/token-balances`);
    
    if (!response.ok) {
      console.log(`PulseChain API response status: ${response.status} ${response.statusText}`);
      
      // If wallet has no tokens, return an empty array instead of throwing error
      if (response.status === 404) {
        console.log(`No tokens found for wallet ${walletAddress}`);
        return [];
      }
      
      throw new Error(`PulseChain Scan API error: ${response.status} ${response.statusText}`);
    }
    
    // The API returns an array of token balances directly
    const tokenBalances = await response.json() as PulseChainTokenBalanceResponse;
    
    if (!Array.isArray(tokenBalances)) {
      console.error('Unexpected response format:', tokenBalances);
      return [];
    }
    
    return tokenBalances.map((item: PulseChainTokenBalance) => {
      try {
        const decimals = parseInt(item.token?.decimals || '18') || 18;
        const balance = item.value || '0';
        const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
        
        return {
          address: item.token?.address || '0x0000000000000000000000000000000000000000',
          symbol: item.token?.symbol || 'UNKNOWN',
          name: item.token?.name || 'Unknown Token',
          decimals,
          balance,
          balanceFormatted,
          logo: (item.token?.icon_url) ? item.token.icon_url : getDefaultLogo(item.token?.symbol),
        };
      } catch (itemError) {
        console.error('Error processing token item:', itemError);
        // Return a placeholder for this token if we can't process it
        return {
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ERROR',
          name: 'Error Processing Token',
          decimals: 18,
          balance: '0',
          balanceFormatted: 0,
          logo: getDefaultLogo(null),
        };
      }
    });
  } catch (error) {
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

/**
 * Get token price from Moralis API
 */
export async function getTokenPrice(tokenAddress: string): Promise<MoralisTokenPriceResponse | null> {
  // Handle special case for native PLS token (0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)
  if (tokenAddress && tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    console.log('Detected request for native PLS token price, using special handling');
    
    // Use wPLS contract address for price (PLS and wPLS are 1:1)
    const { getTokenPriceFromDexScreener } = await import('./dexscreener');
    const plsPrice = await getTokenPriceFromDexScreener(WPLS_TOKEN_ADDRESS);
    
    // Use the price from DexScreener or fall back to default
    const usdPrice = plsPrice || PLS_PRICE_USD_FALLBACK;
    
    console.log(`Native PLS price from DexScreener (using wPLS address): $${usdPrice}`);
    
    // Return a structure with the PLS logo and price
    return {
      tokenName: "PulseChain",
      tokenSymbol: "PLS",
      tokenDecimals: "18",
      nativePrice: {
        value: "1000000000000000000", // 1 with 18 decimals (representing 1 PLS)
        decimals: 18,
        name: "PLS",
        symbol: "PLS",
        address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      },
      usdPrice: usdPrice,
      usdPriceFormatted: usdPrice.toString(),
      exchangeName: "PulseX",
      exchangeAddress: "",
      tokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      blockTimestamp: new Date().toISOString(),
      '24hrPercentChange': "0", // Default if not available
      usdPrice24hrPercentChange: 0, // Default if not available
      tokenLogo: getDefaultLogo('pls'), // Use our default PLS logo
      verifiedContract: true,
      securityScore: 100 // Highest score for native token
    };
  }

  // Standard ERC20 token price fetching
  try {
    console.log(`Fetching price for token ${tokenAddress} from Moralis using chain 0x171 (PulseChain)`);
    
    // Using Moralis SDK to get token price with PulseChain's chain ID (369 or 0x171)
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: "0x171", // PulseChain's chain ID in hex
      include: "percent_change",
      address: tokenAddress
    });
    
    // Log successful price fetch
    console.log(`Successfully fetched price for ${tokenAddress}: ${response.raw.usdPrice} USD`);
    
    if (response.raw.tokenLogo) {
      console.log(`Token ${tokenAddress} has logo URL: ${response.raw.tokenLogo}`);
    } else {
      console.log(`Token ${tokenAddress} does not have a logo URL from Moralis`);
    }
    
    return response.raw as MoralisTokenPriceResponse;
  } catch (error: any) {
    // More detailed error logging
    if (error.response && error.response.status === 404) {
      console.log(`Token ${tokenAddress} not found on Moralis with chain 0x171 (PulseChain)`);
    } else {
      console.error(`Error fetching price for token ${tokenAddress}:`, 
        error.message || 'Unknown error');
    }
    return null;
  }
}

/**
 * Get default logo URL for common tokens
 */
function getDefaultLogo(symbol: string | null | undefined): string {
  if (!symbol) {
    return 'https://cryptologos.cc/logos/placeholder-logo.png';
  }

  const symbolLower = symbol.toLowerCase();
  // Updated with application-specific path for PLS
  const defaultLogos: Record<string, string> = {
    pls: '/assets/pls-logo-trimmed.png', // Use our local, trimmed PLS logo
    hex: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2469.png',
    phex: 'https://cryptologos.cc/logos/hex-hex-logo.png',
    peth: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    pbnb: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  };
  
  return defaultLogos[symbolLower] || 'https://cryptologos.cc/logos/placeholder-logo.png';
}

/**
 * Get wallet balance using Moralis API 
 * (includes native PLS and ERC20 tokens)
 */
export async function getWalletTokenBalancesFromMoralis(walletAddress: string): Promise<any> {
  try {
    console.log(`Fetching wallet balances for ${walletAddress} from Moralis using getWalletTokenBalances endpoint`);
    
    // Fetch token balances using the general token balances endpoint
    const response = await Moralis.EvmApi.token.getWalletTokenBalances({
      chain: "0x171", // Use the hex ID for PulseChain
      address: walletAddress
    });
    
    console.log(`Successfully fetched token balances for ${walletAddress}`);
    
    // Enhanced debugging
    const result = response.raw;
    console.log(`Got response from Moralis with type: ${typeof result}`);
    
    // Check if we have a result
    if (Array.isArray(result)) {
      // Log item count
      console.log(`Moralis returned ${result.length} tokens`);
      
      // Log a sample token for debugging
      if (result.length > 0) {
        console.log('Sample token data:');
        console.log(JSON.stringify(result[0], null, 2));
      }
      
      // We always need to add the native PLS token manually when using Moralis token balances,
      // since the API doesn't return it for PulseChain
      const { getTokenPriceFromDexScreener } = await import('./dexscreener');
      const plsPrice = await getTokenPriceFromDexScreener(WPLS_TOKEN_ADDRESS);
      
      // Get native PLS balance directly from PulseChain Scan (most reliable)
      const plsBalance = await getNativePlsBalance(walletAddress);
      
      // Create tokens array with all tokens including native PLS
      let tokensWithNative = [...result];
      
      // Only add native PLS if we got a balance
      if (plsBalance) {
        console.log(`Adding native PLS token with balance: ${plsBalance.balanceFormatted}`);
        const nativeToken = {
          token_address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          symbol: 'PLS',
          name: 'PulseChain',
          logo: 'https://cryptologos.cc/logos/pulse-pls-logo.png',
          thumbnail: 'https://cryptologos.cc/logos/pulse-pls-logo.png',
          decimals: 18,
          balance: plsBalance.balance,
          balance_formatted: plsBalance.balanceFormatted.toString(),
          possible_spam: false,
          verified_contract: true,
          usd_price: plsPrice || PLS_PRICE_USD_FALLBACK,
          usd_value: plsBalance.balanceFormatted * (plsPrice || PLS_PRICE_USD_FALLBACK),
          security_score: 100,
          is_native: true
        };
        
        // Add native token at the beginning of the array
        tokensWithNative.unshift(nativeToken);
      }
      
      // Add pricing information to each token
      const tokensWithPrices = await Promise.all(
        tokensWithNative.map(async (token: any) => {
          try {
            // For native token that we just added, pricing is already included
            if (token.is_native || 
                token.token_address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
              return token;
            }
            
            // For non-native tokens, try to get price from Moralis
            const priceData = await getTokenPrice(token.token_address);
            if (priceData && priceData.usdPrice) {
              return {
                ...token,
                usd_price: priceData.usdPrice,
                usd_value: parseFloat(token.balance_formatted || '0') * priceData.usdPrice,
                usd_price_24hr_percent_change: priceData.usdPrice24hrPercentChange,
                verified_contract: priceData.verifiedContract
              };
            }
            
            return token;
          } catch (error) {
            console.error(`Error fetching price for token ${token.token_address}:`, error);
            return token;
          }
        })
      );
      
      return tokensWithPrices;
    }
    
    // Just return the raw data if not an array
    return result;
  } catch (error: any) {
    console.error('Error fetching wallet balances from Moralis:', error.message);
    return null;
  }
}

/**
 * Get wallet transaction history from Moralis API with pagination support
 */
export async function getWalletTransactionHistory(
  walletAddress: string, 
  limit: number = 100, // Moralis free plan limits to max 100 transactions per call
  cursorParam: string | null = null
): Promise<any> {
  // Add retry logic - maximum 3 attempts with increasing delay
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Fetching transaction history for ${walletAddress} from Moralis (attempt ${attempt}/${MAX_RETRIES}, limit: ${limit}, cursor: ${cursorParam || 'none'})`);
      
      // Direct API call to Moralis as shown in the working example
      const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImVkN2E1ZDg1LTBkOWItNGMwYS1hZjgxLTc4MGJhNTdkNzllYSIsIm9yZ0lkIjoiNDI0Nzk3IiwidXNlcklkIjoiNDM2ODk0IiwidHlwZUlkIjoiZjM5MGFlMWYtNGY3OC00MzViLWJiNmItZmVhODMwNTdhMzAzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYzOTQ2MzgsImV4cCI6NDg5MjE1NDYzOH0.AmaeD5gXY-0cE-LAGH6TTucbI6AxQ5eufjqXKMc_u98";
      
      // Build URL with parameters
      let url = `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/history`;
      
      // Add query parameters
      const queryParams = new URLSearchParams();
      queryParams.append('chain', '0x171'); // PulseChain chain ID
      queryParams.append('order', 'DESC');
      queryParams.append('limit', limit.toString());
      
      if (cursorParam) {
        queryParams.append('cursor', cursorParam);
      }
      
      url = `${url}?${queryParams.toString()}`;
      console.log(`Making direct Moralis API call to: ${url}`);
      
      // Make the direct API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey
        },
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Moralis API error (${response.status}): ${errorText}`);
        
        // If this is a timeout (504) or internal server error (500), retry
        if ((response.status === 504 || response.status === 500) && attempt < MAX_RETRIES) {
          const retryDelay = INITIAL_RETRY_DELAY * attempt;
          console.log(`${response.status} error received, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue; // Try again
        }
        
        throw new Error(`Moralis API error: ${response.status} ${response.statusText}`);
      }
      
      // Parse the JSON response
      const responseData = await response.json() as any;
      console.log(`Transaction response cursor: ${responseData?.cursor || 'none'}`);
      console.log('Response data keys:', Object.keys(responseData));
      
      const result = responseData?.result || [];
      const cursor = responseData?.cursor || null;
      const page = responseData?.page || 0;
      const page_size = responseData?.page_size || limit;
      
      console.log(`Successfully fetched transaction history for ${walletAddress} - ${result.length} transactions`);
      console.log('First transaction sample:', result.length > 0 ? JSON.stringify(result[0]).substring(0, 300) : 'No transactions');
      
      // Success - return the data
      return {
        result,
        cursor,
        page,
        page_size
      };
      
    } catch (error: any) {
      // Handle AbortController timeout
      if (error.name === 'AbortError') {
        console.error('Request timed out');
        if (attempt < MAX_RETRIES) {
          const retryDelay = INITIAL_RETRY_DELAY * attempt;
          console.log(`Request timed out, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue; // Try again
        }
      }
      
      // If we've exhausted all retries or it's a different error
      if (attempt >= MAX_RETRIES) {
        console.error(`Error fetching wallet transaction history after ${MAX_RETRIES} attempts:`, error.message);
        return {
          result: [],
          cursor: null,
          error: error.message
        };
      }
      
      // For other errors on non-final attempts, retry
      const retryDelay = INITIAL_RETRY_DELAY * attempt;
      console.log(`Error: ${error.message}, retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // This should not be reached due to the return in the final attempt catch block
  return {
    result: [],
    cursor: null,
    error: "Maximum retry attempts exceeded"
  };
}

/**
 * Get full wallet data including token balances and prices
 */
export async function getWalletData(walletAddress: string): Promise<WalletData> {
  try {
    // Initialize loading progress at the start with a reasonable estimate of total batches
    // Use an initial high count to show progress for the entire process
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 50, // Start with a high estimate that will be refined as we go
      message: 'Initializing wallet data fetch...'
    });
    
    // Always get native PLS balance directly from PulseChain Scan API (most reliable method)
    console.log(`Getting native PLS balance for ${walletAddress} using direct API call`);
    
    // Update progress
    updateLoadingProgress({
      currentBatch: 2,
      message: 'Fetching native PLS balance...'
    });
    
    let nativePlsBalance = await getNativePlsBalance(walletAddress);
    console.log(`Native PLS balance from direct API call: ${nativePlsBalance?.balanceFormatted || 'Not found'}`);
    
    // Try to get token data from Moralis (includes other tokens with prices)
    // Update progress
    updateLoadingProgress({
      currentBatch: 3,
      message: 'Fetching token data from Moralis...'
    });
    
    const moralisData = await getWalletTokenBalancesFromMoralis(walletAddress);
    
    // If we have Moralis data, use it
    // Check if moralisData is an array (direct result) or has a result property
    const moralisTokens = Array.isArray(moralisData) ? moralisData : 
                         (moralisData && moralisData.result) ? moralisData.result : [];
                         
    if (moralisTokens.length > 0) {
      console.log(`Got wallet data from Moralis with ${moralisTokens.length} tokens`);
      
      // Process tokens in batches to avoid overwhelming API
      const BATCH_SIZE = 15; // Process 15 tokens at a time (increased from 5 for faster loading)
      const processedTokens: ProcessedToken[] = [];
      const totalBatches = Math.ceil(moralisTokens.length/BATCH_SIZE);
      
      // Update existing loading progress with the new batch count
      // But maintain the overall progress count by starting at 5
      updateLoadingProgress({
        status: 'loading',
        currentBatch: 5,
        // Adjust totalBatches to include our previous steps (1-4) plus the new batches
        totalBatches: totalBatches + 5,
        message: 'Processing token data...'
      });
      
      // Process tokens in batches
      for (let i = 0; i < moralisTokens.length; i += BATCH_SIZE) {
        const currentBatch = Math.floor(i/BATCH_SIZE) + 1;
        console.log(`Processing token batch ${currentBatch}/${totalBatches}`);
        
        // Update loading progress - add the offset to maintain continuous progress
        updateLoadingProgress({
          currentBatch: currentBatch + 5, // Add 5 to account for previous steps
          message: `Processing token batch ${currentBatch}/${totalBatches}...`
        });
        
        const batch = moralisTokens.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (item: any) => {
          try {
            // Check if this is the native PLS token (either with is_native flag or by address)
            const isNative = item.is_native === true || 
                            (item.token_address && 
                            (item.token_address.toLowerCase() === PLS_TOKEN_ADDRESS.toLowerCase() || 
                             item.token_address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'));
            
            // Handle token symbol and name
            let symbol = item.symbol || 'UNKNOWN';
            let name = item.name || 'Unknown Token';
            
            // Fix the native token representation if needed
            if (isNative) {
              symbol = 'PLS'; // Ensure consistent symbol for native token
              name = 'PulseChain'; // Ensure consistent name for native token
            }
            
            // Handle token logo
            let logoUrl = item.logo || item.thumbnail || null;
            
            // If no logo in Moralis response, try our database
            if (!logoUrl) {
              const storedLogo = await storage.getTokenLogo(item.token_address);
              if (storedLogo) {
                logoUrl = storedLogo.logoUrl;
              } else {
                // If still no logo, use default
                logoUrl = getDefaultLogo(symbol);
              }
            } else {
              // Store the logo in our database for future use
              try {
                const newLogo: InsertTokenLogo = {
                  tokenAddress: item.token_address,
                  logoUrl,
                  symbol,
                  name,
                  lastUpdated: new Date().toISOString()
                };
                
                console.log(`Saving logo for token ${item.token_address}: {
  url: '${logoUrl?.substring(0, 20)}...',
  symbol: '${symbol}',
  name: '${name}'
}`);
                
                await storage.saveTokenLogo(newLogo);
              } catch (storageError) {
                console.error(`Error storing logo for token ${item.token_address}:`, storageError);
              }
            }
            
            // Handle balance formatting - ensure we convert the string balance to a proper number
            const balanceFormatted = item.balance_formatted ? 
                                    parseFloat(item.balance_formatted) : 
                                    parseFloat(item.balance || '0') / Math.pow(10, parseInt(item.decimals || '18'));
            
            // Check if item has price info added by our getWalletTokenBalancesFromMoralis function
            const price = item.usd_price || undefined;
            const value = item.usd_value || (price ? balanceFormatted * price : undefined);
            
            // Always set a default security score for all tokens
            // Native tokens get 100, verified tokens get 90, other tokens get 50 as a base
            const defaultScore = isNative ? 100 : (item.verified_contract === true || item.possible_spam === false) ? 90 : 50;
            
            return {
              address: item.token_address,
              symbol,
              name,
              decimals: parseInt(item.decimals || '18'),
              balance: item.balance || '0',
              balanceFormatted, // Use our properly formatted balance
              price,
              value,
              priceChange24h: item.usd_price_24hr_percent_change,
              logo: logoUrl,
              exchange: item.exchangeName || '', 
              verified: item.verified_contract === true || item.possible_spam === false,
              securityScore: item.securityScore || defaultScore,
              isNative
          };
        } catch (error) {
          console.error(`Error processing token from Moralis:`, error);
          return null;
        }
      }));
      
      // Add batch results to processed tokens array
      processedTokens.push(...batchResults.filter(Boolean) as ProcessedToken[]);
        
      // Add a delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < moralisTokens.length) {
        console.log("Waiting 500ms before processing next batch...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
      
      // Filter out any null items from processing errors
      const tokens = processedTokens.filter(t => t !== null);
      
      // Find the native PLS token - be more flexible in detection
      // Set address as all lowercase for consistent comparison
      const plsTokenAddress = PLS_TOKEN_ADDRESS.toLowerCase();
      
      const plsToken = tokens.find(token => 
        token.isNative === true || 
        token.symbol.toLowerCase() === 'pls' || 
        token.address.toLowerCase() === plsTokenAddress || 
        token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' // Common native token address
      );
      
      // Debug the native token detection
      if (plsToken) {
        console.log(`Found PLS token: ${plsToken.symbol} with balance ${plsToken.balanceFormatted}`);
      } else {
        console.log(`PLS token not found. Tokens: ${tokens.map(t => t.symbol).join(', ')}`);
      }
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Update loading progress to complete
      updateLoadingProgress({
        status: 'complete',
        currentBatch: totalBatches + 5, // Add 5 to account for previous steps
        totalBatches: totalBatches + 5, // Ensure we have the right total
        message: 'Data loaded successfully'
      });
      
      return {
        address: walletAddress,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance: nativePlsBalance?.balanceFormatted || plsToken?.balanceFormatted || null,
        plsPriceChange: plsToken?.priceChange24h || null,
        networkCount: 1 // Default to PulseChain network
      };
    }
    
    // Fallback to the PulseChain Scan API for token balances (we already have the native PLS)
    console.log('Falling back to PulseChain Scan API for token balances');
    
    // Update progress
    updateLoadingProgress({
      currentBatch: 4,
      message: 'Fetching token balances from PulseChain Scan...'
    });
    
    // Get token balances from PulseChain Scan API
    const tokens = await getTokenBalances(walletAddress);
    
    // If we have a native PLS balance, add it as a token at the top of the list
    if (nativePlsBalance) {
      console.log(`Adding native PLS token with balance: ${nativePlsBalance.balanceFormatted}`);
      
      // Get PLS price from DexScreener using wPLS address
      let plsPrice = PLS_PRICE_USD_FALLBACK; // Start with fallback price
      try {
        const { getTokenPriceFromDexScreener } = await import('./dexscreener');
        const dexScreenerPrice = await getTokenPriceFromDexScreener(WPLS_TOKEN_ADDRESS);
        if (dexScreenerPrice !== null) {
          plsPrice = dexScreenerPrice;
          console.log(`Got PLS price from DexScreener (using wPLS): $${plsPrice}`);
        } else {
          console.log(`Couldn't get PLS price from DexScreener, using fallback: $${plsPrice}`);
        }
      } catch (error) {
        console.error('Error getting PLS price from DexScreener:', error);
        console.log(`Using fallback PLS price: $${plsPrice}`);
      }
      
      // Add native PLS token to the beginning of the token list
      tokens.unshift({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: nativePlsBalance.balance,
        balanceFormatted: nativePlsBalance.balanceFormatted,
        price: plsPrice, // Use dynamically fetched price
        value: nativePlsBalance.balanceFormatted * plsPrice,
        logo: getDefaultLogo('pls'),
        isNative: true,
        priceChange24h: 0, // Default if not available
        exchange: 'PulseX',
        verified: true,
        securityScore: 100 // Highest score for native token
      });
    }
    
    // If no tokens found and no native PLS, still return a valid response with empty data
    if (tokens.length === 0 && !nativePlsBalance) {
      console.log(`No tokens or native PLS found for wallet ${walletAddress}, returning empty data`);
      return {
        address: walletAddress,
        tokens: [],
        totalValue: 0,
        tokenCount: 0,
        plsBalance: null,
        plsPriceChange: null,
        networkCount: 1
      };
    }
    
    // Process tokens in batches to avoid overwhelming API
    console.log(`Processing ${tokens.length} tokens in batches for price data...`);
    const BATCH_SIZE = 15; // Process 15 tokens at a time (increased from 5 for faster loading)
    const tokensWithPrice: ProcessedToken[] = [];
    const totalBatches = Math.ceil(tokens.length/BATCH_SIZE);
    
    // Update existing loading progress for fallback method
    // But maintain the overall progress count by starting at 5
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 5,
      // Adjust totalBatches to include our previous steps (1-4) plus the new batches
      totalBatches: totalBatches + 5,
      message: 'Processing token price data...'
    });
    
    // Process tokens in batches
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const currentBatch = Math.floor(i/BATCH_SIZE) + 1;
      console.log(`Processing fallback token batch ${currentBatch}/${totalBatches}`);
      
      // Update loading progress - add the offset to maintain continuous progress
      updateLoadingProgress({
        currentBatch: currentBatch + 5, // Add 5 to account for previous steps
        message: `Processing price data batch ${currentBatch}/${totalBatches}...`
      });
      
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (token) => {
        try {
          // First, try to get logo from our database
          let logoUrl = token.logo;
          const storedLogo = await storage.getTokenLogo(token.address);
          
          if (storedLogo) {
            logoUrl = storedLogo.logoUrl;
          }
          
          const priceData = await getTokenPrice(token.address);
          
          if (priceData) {
            // If we don't have a logo yet and Moralis has one, use it and store it
            if (!logoUrl && priceData.tokenLogo) {
              logoUrl = priceData.tokenLogo;
              
              // Store the logo in our database for future use
              try {
                const newLogo: InsertTokenLogo = {
                  tokenAddress: token.address,
                  logoUrl: priceData.tokenLogo,
                  symbol: priceData.tokenSymbol || token.symbol,
                  name: priceData.tokenName || token.name,
                  lastUpdated: new Date().toISOString()
                };
                
                await storage.saveTokenLogo(newLogo);
                console.log(`Stored logo for token ${token.symbol} (${token.address})`);
              } catch (storageError) {
                console.error(`Error storing logo for token ${token.address}:`, storageError);
              }
            }
            
            // If we still don't have a logo, use default
            if (!logoUrl) {
              logoUrl = getDefaultLogo(token.symbol);
            }
            
            // Parse percent change as a number (remove the minus sign if present and convert)
            const percentChangeStr = priceData['24hrPercentChange'] || '0';
            const percentChange = parseFloat(percentChangeStr.replace(/-/g, '')) * (percentChangeStr.includes('-') ? -1 : 1);
            
            return {
              ...token,
              name: priceData.tokenName || token.name, // Use Moralis name if available
              price: priceData.usdPrice,
              value: token.balanceFormatted * priceData.usdPrice,
              priceChange24h: priceData.usdPrice24hrPercentChange || percentChange || 0,
              logo: logoUrl,
              exchange: priceData.exchangeName,
              verified: priceData.verifiedContract,
              securityScore: priceData.securityScore,
            };
          }
          
          // If we don't have price data, but have a stored logo, use it
          if (storedLogo) {
            return {
              ...token,
              logo: storedLogo.logoUrl,
            };
          }
          
          return token;
        } catch (error) {
          console.error(`Error processing price for token ${token.symbol}:`, error);
          return token;
        }
      }));
      
      // Add batch results to processed tokens array
      tokensWithPrice.push(...batchResults);
      
      // Add a delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < tokens.length) {
        console.log("Waiting 500ms before processing next batch...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Calculate total value
    let totalValue = 0;
    tokensWithPrice.forEach(token => {
      if (token.value) {
        totalValue += token.value;
      }
    });
    
    // Find PLS token (native token) - consistent with the above implementation
    const plsTokenAddress = PLS_TOKEN_ADDRESS.toLowerCase();
    
    const plsToken = tokensWithPrice.find(token => 
      token.isNative === true || 
      token.symbol.toLowerCase() === 'pls' || 
      token.address.toLowerCase() === plsTokenAddress || 
      token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' // Common native token address
    );
    
    // Debug the native token detection
    if (plsToken) {
      console.log(`Found PLS token (fallback): ${plsToken.symbol} with balance ${plsToken.balanceFormatted}`);
    } else {
      console.log(`PLS token not found in fallback. Tokens: ${tokensWithPrice.map(t => t.symbol).join(', ')}`);
    }
    
    // Update loading progress to complete
    updateLoadingProgress({
      status: 'complete',
      currentBatch: totalBatches + 5, // Add 5 to account for previous steps
      totalBatches: totalBatches + 5, // Ensure we have the right total
      message: 'Data loaded successfully'
    });
    
    // Give clients time to see the completed progress
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      address: walletAddress,
      tokens: tokensWithPrice,
      totalValue,
      tokenCount: tokens.length,
      plsBalance: nativePlsBalance?.balanceFormatted || plsToken?.balanceFormatted || null,
      plsPriceChange: plsToken?.priceChange24h || null,
      networkCount: 1, // Default to PulseChain network
    };
  } catch (error) {
    console.error('Error in getWalletData:', error);
    
    // Update loading progress to error state
    updateLoadingProgress({
      status: 'error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
    
    throw error;
  }
}
