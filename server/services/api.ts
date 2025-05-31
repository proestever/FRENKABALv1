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
import { InsertTokenLogo, TokenLogo } from '@shared/schema';
import { updateLoadingProgress } from '../routes';
import { processLpTokens } from './lp-token-service';
import { cacheService } from './cache-service';
import { apiStatsService } from './api-stats-service';
import { getTokenPriceFromDexScreener, getTokenPriceDataFromDexScreener } from './dexscreener';
import { shouldUseDexScreenerForToken } from './price-source-service';

// API call counter for monitoring and debugging
interface ApiCallCounter {
  total: number;
  byWallet: Record<string, number>;
  byEndpoint: Record<string, number>;
  lastReset: number;
}

// Initialize the counter
const apiCallCounter: ApiCallCounter = {
  total: 0,
  byWallet: {},
  byEndpoint: {},
  lastReset: Date.now()
};

// Helper function to track API calls
function trackApiCall(walletAddress: string | null, endpoint: string, startTime?: number): void {
  // Calculate response time if startTime is provided
  const responseTime = startTime ? Date.now() - startTime : null;
  
  // Track in memory counter
  apiCallCounter.total++;
  
  // Track by endpoint
  if (!apiCallCounter.byEndpoint[endpoint]) {
    apiCallCounter.byEndpoint[endpoint] = 0;
  }
  apiCallCounter.byEndpoint[endpoint]++;
  
  // Track by wallet if provided
  if (walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    if (!apiCallCounter.byWallet[normalizedAddress]) {
      apiCallCounter.byWallet[normalizedAddress] = 0;
    }
    apiCallCounter.byWallet[normalizedAddress]++;
  }
  
  // Log the current state
  console.log(`[API Counter] Total calls: ${apiCallCounter.total}, Endpoint: ${endpoint}, Wallet: ${walletAddress || 'n/a'}`);
  
  // Persist to database
  try {
    apiStatsService.recordApiCall(
      endpoint,
      walletAddress, 
      responseTime,
      false, // Not from cache - if it's from cache we wouldn't be making an API call
      true,  // Successful by default, error handlers will record failures separately
      null   // No error message
    ).catch(err => {
      console.error('[API Counter] Failed to record API call to database:', err);
    });
  } catch (error) {
    console.error('[API Counter] Error persisting API call stats:', error);
    // Non-critical functionality, don't throw or stop execution
  }
}

// Function to reset counter
export function resetApiCounter(): ApiCallCounter {
  const result = { ...apiCallCounter };
  apiCallCounter.total = 0;
  apiCallCounter.byWallet = {};
  apiCallCounter.byEndpoint = {};
  apiCallCounter.lastReset = Date.now();
  console.log('[API Counter] Reset completed');
  return result;
}

// Function to get current counter state
export function getApiCounterStats(): ApiCallCounter {
  return { ...apiCallCounter };
}
// Initialize Moralis
try {
  const moralisApiKey = process.env.MORALIS_API_KEY;
  if (!moralisApiKey) {
    throw new Error("MORALIS_API_KEY environment variable is required");
  }
  
  Moralis.start({
    apiKey: moralisApiKey
  });
  console.log("Moralis initialized successfully");
} catch (error) {
  console.error("Failed to initialize Moralis:", error);
}

// Constants
const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // PulseChain native token is 0xeee...eee 
const PLS_CONTRACT_ADDRESS = '0x5616458eb2bAc88dD60a4b08F815F37335215f9B'; // Alternative PLS contract address
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'; // wPLS contract address for accurate price
const PLS_DECIMALS = 18; // Native PLS has 18 decimals
const PLS_PRICE_USD = 0.000025; // Initial placeholder price if API fails - updated May 2024

// List of important tokens that should always be included in wallet data
const IMPORTANT_TOKENS = [
  '0xec4252e62c6de3d655ca9ce3afc12e553ebba274', // PUMP token
  '0x6C203A555824ec90a215f37916cf8Db58EBe2fA3', // Token with incorrect Moralis price
];

// Note: Moralis is already initialized at the top of the file

/**
 * Get native PLS balance for a wallet address directly from Moralis API
 */
export async function getNativePlsBalance(walletAddress: string): Promise<{balance: string, balanceFormatted: number} | null> {
  try {
    // Track API call
    trackApiCall(walletAddress, 'getNativePlsBalance');
    console.log(`Fetching native PLS balance for ${walletAddress} from Moralis API`);
    
    // Using direct Moralis API call with the correct endpoint
    const apiKey = MORALIS_API_KEY;
    if (!apiKey) {
      throw new Error("MORALIS_API_KEY environment variable is required");
    }
    
    // Direct API call instead of SDK which might be using a different endpoint
    const url = `https://deep-index.moralis.io/api/v2/${walletAddress}/balance?chain=0x171`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Moralis API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as {
      balance?: string;
      error?: string;
    };
    
    // Extract the balance from the response
    const balanceWei = data.balance;
    if (!balanceWei) {
      console.log('Could not find balance in Moralis API response');
      return null;
    }
    
    // Format the balance from wei to PLS (divide by 10^18)
    const balanceFormatted = parseFloat(balanceWei) / Math.pow(10, PLS_DECIMALS);
    console.log(`Native PLS balance for ${walletAddress}: ${balanceFormatted} PLS (raw: ${balanceWei})`);
    
    return {
      balance: balanceWei,
      balanceFormatted
    };
  } catch (error) {
    console.error('Error fetching native PLS balance from Moralis:', error);
    
    // If direct API call fails, try using the SDK
    try {
      console.log('Trying alternative Moralis SDK method for native balance');
      
      const response = await Moralis.EvmApi.balance.getNativeBalance({
        chain: "0x171", // Use hex chain ID instead of string
        address: walletAddress
      });
      
      // Extract the balance from the response
      const balanceWei = response.raw.balance;
      if (!balanceWei) {
        console.log('Could not find balance in Moralis SDK response');
        throw new Error('No balance found');
      }
      
      // Format the balance from wei to PLS (divide by 10^18)
      const balanceFormatted = parseFloat(balanceWei) / Math.pow(10, PLS_DECIMALS);
      console.log(`Native PLS balance from Moralis SDK: ${balanceFormatted} PLS (raw: ${balanceWei})`);
      
      return {
        balance: balanceWei,
        balanceFormatted
      };
    } catch (sdkError) {
      console.error('Error using Moralis SDK for native balance:', sdkError);
      
      // If both Moralis methods fail, fall back to PulseChain Scan API
      console.log('Falling back to PulseChain Scan API for native balance');
      try {
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
        console.log(`Native PLS balance from fallback API for ${walletAddress}: ${balanceFormatted} PLS (raw: ${coinBalance})`);
        
        return {
          balance: coinBalance,
          balanceFormatted
        };
      } catch (fallbackError) {
        console.error('Error in fallback method for fetching native PLS balance:', fallbackError);
        return null;
      }
    }
  }
}

/**
 * Get token balances for a wallet address from PulseChain Scan API
 */
export async function getTokenBalances(walletAddress: string): Promise<ProcessedToken[]> {
  try {
    // Track API call
    trackApiCall(walletAddress, 'getTokenBalances');
    console.log(`Fetching token balances for ${walletAddress} from PulseChain Scan API`);
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
    
    console.log(`Retrieved ${tokenBalances.length} tokens from PulseChain Scan for wallet ${walletAddress}`);
    
    // Log token details for debugging
    tokenBalances.forEach(item => {
      console.log(`Found token: ${item.token?.symbol || 'UNKNOWN'} (${item.token?.address || 'no address'}) - balance: ${item.value || '0'}`);
    });
    
    return tokenBalances.map((item: PulseChainTokenBalance) => {
      try {
        const decimals = parseInt(item.token?.decimals || '18') || 18;
        const balance = item.value || '0';
        const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
        
        // Check if this is a PulseX LP token
        const isLp = 
          // Check symbol conventions
          item.token?.symbol?.includes('PLP-') || 
          item.token?.symbol?.includes('-LP') || 
          item.token?.symbol?.includes('PulseX-LP') ||
          // Match well-known PulseX v1 and v2 LP formats 
          (item.token?.symbol?.toLowerCase().includes('lp') && 
          (item.token?.name?.toLowerCase().includes('pulsex') || 
           item.token?.name?.toLowerCase().includes('pulseswap') || 
           item.token?.name?.toLowerCase().includes('plp')));
        
        // Extract token symbols from LP token name if possible
        let lpToken0Symbol = undefined;
        let lpToken1Symbol = undefined;
        let lpToken0Address = undefined;
        let lpToken1Address = undefined;
        
        // Different naming conventions for LP tokens
        if (isLp) {
          console.log(`Found LP token: ${item.token?.symbol} - ${item.token?.name}`);
          
          // Try to extract token pairs from the symbol
          if (item.token?.symbol?.includes('-')) {
            const parts = item.token?.symbol.split('-');
            // PLP-TOKEN1-TOKEN2 or TOKEN1-TOKEN2-LP
            if (parts.length >= 3) {
              // Determine format based on prefix/suffix
              if (parts[0].toUpperCase() === 'PLP') {
                lpToken0Symbol = parts[1];
                lpToken1Symbol = parts[2];
              } else if (parts[parts.length-1].toUpperCase() === 'LP') {
                lpToken0Symbol = parts[0];
                lpToken1Symbol = parts[1];
              }
            } else if (parts.length === 2) {
              // Simple TOKEN1-TOKEN2 format
              lpToken0Symbol = parts[0];
              lpToken1Symbol = parts[1];
            }
          }
          
          // If we couldn't extract from symbol, try the name
          if (!lpToken0Symbol && !lpToken1Symbol && item.token?.name) {
            // Try to extract from name formats like "PulseX LPs TOKEN1/TOKEN2"
            if (item.token.name.includes('/')) {
              const nameParts = item.token.name.split('/');
              if (nameParts.length >= 2) {
                // Extract the last part as it might contain the symbols
                const lastPart = nameParts[nameParts.length - 1];
                // Look for TOKEN1/TOKEN2 format
                const pairParts = lastPart.split(' ');
                if (pairParts.length >= 1) {
                  const pairSymbols = pairParts[0].split('/');
                  if (pairSymbols.length === 2) {
                    lpToken0Symbol = pairSymbols[0].trim();
                    lpToken1Symbol = pairSymbols[1].trim();
                  }
                }
              }
            }
          }
        }
        
        return {
          address: item.token?.address || '0x0000000000000000000000000000000000000000',
          symbol: item.token?.symbol || 'UNKNOWN',
          name: item.token?.name || 'Unknown Token',
          decimals,
          balance,
          balanceFormatted,
          logo: (item.token?.icon_url) ? item.token.icon_url : getDefaultLogo(item.token?.symbol),
          isLp,
          lpToken0Symbol,
          lpToken1Symbol,
          lpToken0Address,
          lpToken1Address,
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
 * Get specific token balance for a wallet address
 * This is useful for tokens that might not be picked up by the standard APIs
 */
export async function getSpecificTokenBalance(walletAddress: string, tokenAddress: string): Promise<ProcessedToken | null> {
  try {
    // Track API call
    trackApiCall(walletAddress, 'getSpecificTokenBalance');
    console.log(`Fetching specific token balance for ${tokenAddress} in wallet ${walletAddress}`);
    
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    
    // Try using the Moralis SDK to get the token metadata and balance
    const response = await Moralis.EvmApi.token.getWalletTokenBalances({
      address: walletAddress,
      chain: "0x171", // PulseChain's chain ID in hex
      tokenAddresses: [tokenAddress]
    });
    
    if (response && response.raw && response.raw.length > 0) {
      const tokenData = response.raw[0];
      const decimalsStr = typeof tokenData.decimals === 'number' ? String(tokenData.decimals) : (tokenData.decimals || "18");
      const decimals = parseInt(decimalsStr, 10);
      const balance = tokenData.balance;
      const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
      
      // Try to get price data - first check if the token should use DexScreener
      let price: number | undefined = undefined;
      let value: number | undefined = undefined;
      let priceChange24h: number | undefined = undefined;
      let logoUrl: string | undefined = tokenData.logo;
      
      // Try to get logo from database first
      try {
        const storedLogo = await storage.getTokenLogo(normalizedTokenAddress);
        if (storedLogo) {
          logoUrl = storedLogo.logoUrl;
        }
      } catch (logoError) {
        console.log(`Error getting logo from database for ${tokenAddress}:`, logoError);
      }
      
      // Price fetching strategy
      const useDexScreener = await shouldUseDexScreenerForToken(normalizedTokenAddress);
      
      if (useDexScreener) {
        console.log(`Using DexScreener for price of token ${tokenAddress}`);
        try {
          const dexScreenerData = await getTokenPriceDataFromDexScreener(normalizedTokenAddress);
          if (dexScreenerData !== null) {
            price = dexScreenerData.price;
            value = price * balanceFormatted;
            priceChange24h = dexScreenerData.priceChange24h;
            console.log(`DexScreener data for ${tokenAddress}: price=${price}, change24h=${priceChange24h}%`);
          }
        } catch (dexError) {
          console.log(`Error getting price from DexScreener for ${tokenAddress}:`, dexError);
        }
      } else {
        // Use Moralis batch price API via our getMultipleTokenPrices function
        try {
          const priceDataMap = await getMultipleTokenPrices([tokenAddress]);
          const priceData = priceDataMap[normalizedTokenAddress];
          if (priceData) {
            price = priceData.usdPrice || 0;
            value = price * balanceFormatted;
            priceChange24h = priceData.usdPrice24hrPercentChange || 0;
            
            // If we don't have a logo yet and Moralis has one, use it
            if (!logoUrl && priceData.tokenLogo) {
              logoUrl = priceData.tokenLogo;
              
              // Store the logo for future use
              try {
                const newLogo: InsertTokenLogo = {
                  tokenAddress: tokenAddress,
                  logoUrl: priceData.tokenLogo,
                  symbol: priceData.tokenSymbol || tokenData.symbol || 'UNKNOWN',
                  name: priceData.tokenName || tokenData.name || 'Unknown Token',
                  lastUpdated: new Date().toISOString()
                };
                
                await storage.saveTokenLogo(newLogo);
              } catch (storageError) {
                console.error(`Error storing logo for token ${tokenAddress}:`, storageError);
              }
            }
          }
        } catch (priceError: any) {
          console.log(`Could not get price for token ${tokenAddress}: ${priceError.message || "Unknown error"}`);
        }
      }
      
      // If still no logo, use default
      if (!logoUrl) {
        logoUrl = getDefaultLogo(tokenData.symbol);
      }
      
      return {
        address: tokenAddress,
        symbol: tokenData.symbol || 'UNKNOWN',
        name: tokenData.name || 'Unknown Token',
        decimals,
        balance,
        balanceFormatted,
        price,
        value,
        priceChange24h,
        logo: logoUrl,
        verified: tokenData.verified_contract || false
      };
    }
    
    console.log(`No balance found for token ${tokenAddress} in wallet ${walletAddress}`);
    return null;
  } catch (error) {
    console.error(`Error fetching specific token balance:`, error);
    return null;
  }
}

/**
 * Get PLS price using wPLS contract address
 * This provides more accurate price data for the native PLS token
 */
export async function getNativePlsPrice(): Promise<{price: number, priceChange24h: number} | null> {
  try {
    // Track API call
    trackApiCall(null, 'getNativePlsPrice');
    console.log(`Fetching native PLS price using wPLS contract: ${WPLS_CONTRACT_ADDRESS}`);
    
    // Using Moralis SDK to get wPLS token price with PulseChain's chain ID (369 or 0x171)
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: "0x171", // PulseChain's chain ID in hex
      include: "percent_change",
      address: WPLS_CONTRACT_ADDRESS
    });
    
    // Extract the price and 24h change
    const price = response.raw.usdPrice || 0;
    const priceChange = parseFloat(response.raw['24hrPercentChange'] || '0');
    
    console.log(`Successfully fetched PLS price from wPLS contract: ${price} USD, 24h change: ${priceChange}%`);
    
    return {
      price: price,
      priceChange24h: priceChange
    };
  } catch (error: any) {
    console.error('Error fetching native PLS price from wPLS contract:', error.message || 'Unknown error');
    return null;
  }
}

/**
 * Get token price from Moralis API (with caching)
 */
export async function getTokenPrice(tokenAddress: string): Promise<MoralisTokenPriceResponse | null> {
  if (!tokenAddress) {
    console.log('Token address is null or undefined');
    return null;
  }
  
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first to avoid unnecessary API calls and track API call if needed
  const cachedPrice = cacheService.getTokenPrice(normalizedAddress);
  if (cachedPrice) {
    return cachedPrice;
  }
  
  // If we got here, no cache hit, so track the API call
  trackApiCall(null, 'getTokenPrice');
  
  // Handle special case for native PLS token (0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)
  if (normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    console.log('Detected request for native PLS token price, using wPLS contract for accuracy');
    
    // Try to get the current PLS price from wPLS contract
    const plsPrice = await getNativePlsPrice();
    const plsPriceUsd = plsPrice?.price || PLS_PRICE_USD;
    const plsPriceChange = plsPrice?.priceChange24h || 0;
    
    // Format the price for display
    const plsPriceFormatted = plsPriceUsd.toString();
    
    // Return a structure with the PLS logo and price data
    const result = {
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
      usdPrice: plsPriceUsd,
      usdPriceFormatted: plsPriceFormatted,
      exchangeName: "PulseX",
      exchangeAddress: "",
      tokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      blockTimestamp: new Date().toISOString(),
      '24hrPercentChange': plsPriceChange.toString(),
      usdPrice24hrPercentChange: plsPriceChange,
      tokenLogo: getDefaultLogo('pls'), // Use our default PLS logo
      verifiedContract: true,
      securityScore: 100 // Highest score for native token
    };
    
    // Cache the result
    cacheService.setTokenPrice(normalizedAddress, result);
    
    return result;
  }

  // Check if this token should use DexScreener instead of Moralis
  const useDexScreener = await shouldUseDexScreenerForToken(normalizedAddress);
  
  if (useDexScreener) {
    console.log(`Token ${normalizedAddress} is configured to use DexScreener for pricing`);
    
    try {
      // Get price from DexScreener
      const dexScreenerPrice = await getTokenPriceFromDexScreener(normalizedAddress);
      
      if (dexScreenerPrice !== null) {
        console.log(`Successfully fetched price from DexScreener for ${normalizedAddress}: ${dexScreenerPrice} USD`);
        
        // Get token metadata if available
        let symbol = '';
        let name = '';
        let logoUrl = null;
        
        try {
          const storedLogo = await storage.getTokenLogo(normalizedAddress);
          if (storedLogo) {
            symbol = storedLogo.symbol || '';
            name = storedLogo.name || '';
            logoUrl = storedLogo.logoUrl;
          }
        } catch (logoErr) {
          console.error('Error fetching token logo:', logoErr);
        }
        
        // Create a Moralis-like response structure with the DexScreener price
        const result = {
          tokenName: name || 'Unknown Token',
          tokenSymbol: symbol || 'UNKNOWN',
          tokenDecimals: "18",
          tokenLogo: logoUrl || getDefaultLogo(symbol),
          nativePrice: {
            value: "1000000000000000000",
            decimals: 18,
            name: "PLS",
            symbol: "PLS",
            address: PLS_TOKEN_ADDRESS
          },
          usdPrice: dexScreenerPrice,
          usdPriceFormatted: dexScreenerPrice.toString(),
          exchangeName: "DexScreener",
          exchangeAddress: "",
          tokenAddress: normalizedAddress,
          blockTimestamp: new Date().toISOString(),
          verifiedContract: false, // We don't have this info from DexScreener
          securityScore: 50 // Neutral score
        };
        
        // Cache the result
        cacheService.setTokenPrice(normalizedAddress, result);
        
        return result;
      } else {
        console.log(`DexScreener didn't return price for ${normalizedAddress}, falling back to Moralis`);
      }
    } catch (dexScreenerError) {
      console.error(`Error fetching price from DexScreener for ${normalizedAddress}:`, dexScreenerError);
      console.log('Falling back to Moralis API');
    }
  }

  // Standard ERC20 token price fetching with Moralis (default or fallback)
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
    
    // Cache the result before returning
    cacheService.setTokenPrice(normalizedAddress, response.raw);
    
    return response.raw as MoralisTokenPriceResponse;
  } catch (error: any) {
    // More detailed error logging
    if (error.response && error.response.status === 404) {
      console.log(`Token ${tokenAddress} not found on Moralis with chain 0x171 (PulseChain)`);
    } else {
      console.error(`Error fetching price for token ${tokenAddress}:`, 
        error.message || 'Unknown error');
    }
    
    // Try DexScreener as last resort if we didn't already
    if (!useDexScreener) {
      try {
        console.log(`Trying DexScreener as fallback for ${normalizedAddress}`);
        const dexScreenerPrice = await getTokenPriceFromDexScreener(normalizedAddress);
        
        if (dexScreenerPrice !== null) {
          console.log(`Successfully fetched fallback price from DexScreener for ${normalizedAddress}: ${dexScreenerPrice} USD`);
          
          // Get token metadata if available
          let symbol = '';
          let name = '';
          let logoUrl = null;
          
          try {
            const storedLogo = await storage.getTokenLogo(normalizedAddress);
            if (storedLogo) {
              symbol = storedLogo.symbol || '';
              name = storedLogo.name || '';
              logoUrl = storedLogo.logoUrl;
            }
          } catch (logoErr) {
            console.error('Error fetching token logo:', logoErr);
          }
          
          // Create a Moralis-like response structure with the DexScreener price
          const result = {
            tokenName: name || 'Unknown Token',
            tokenSymbol: symbol || 'UNKNOWN',
            tokenDecimals: "18",
            tokenLogo: logoUrl || getDefaultLogo(symbol),
            nativePrice: {
              value: "1000000000000000000",
              decimals: 18,
              name: "PLS",
              symbol: "PLS",
              address: PLS_TOKEN_ADDRESS
            },
            usdPrice: dexScreenerPrice,
            usdPriceFormatted: dexScreenerPrice.toString(),
            exchangeName: "DexScreener (Fallback)",
            exchangeAddress: "",
            tokenAddress: normalizedAddress,
            blockTimestamp: new Date().toISOString(),
            verifiedContract: false,
            securityScore: 50
          };
          
          // Cache the result
          cacheService.setTokenPrice(normalizedAddress, result);
          
          return result;
        }
      } catch (fallbackError) {
        console.error(`Error fetching fallback price from DexScreener for ${normalizedAddress}:`, fallbackError);
      }
    }
    
    return null;
  }
}

/**
 * Get multiple token prices at once from Moralis API (with caching)
 * This function dramatically reduces API calls by batching requests
 */
export async function getMultipleTokenPrices(tokenAddresses: string[]): Promise<Record<string, MoralisTokenPriceResponse>> {
  if (!tokenAddresses || tokenAddresses.length === 0) {
    console.log('No token addresses provided for batch price fetch');
    return {};
  }
  
  // Normalize all addresses
  const normalizedAddresses = tokenAddresses.map(addr => addr.toLowerCase());
  
  // Track API call - only track once for the batch
  trackApiCall(null, 'getMultipleTokenPrices');
  
  console.log(`Fetching prices for ${normalizedAddresses.length} tokens in batch`);
  
  // Check cache first and collect addresses that need fetching
  const results: Record<string, MoralisTokenPriceResponse> = {};
  const addressesToFetch: string[] = [];
  
  // First pass: check cache and collect uncached addresses
  for (const address of normalizedAddresses) {
    const cachedPrice = cacheService.getTokenPrice(address);
    if (cachedPrice) {
      results[address] = cachedPrice;
    } else {
      // Special case for native PLS token
      if (address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        // We'll handle this separately
        continue;
      }
      addressesToFetch.push(address);
    }
  }
  
  // If all prices were in cache, return early
  if (addressesToFetch.length === 0) {
    console.log('All token prices found in cache, no need for API calls');
    
    // Check if we need to handle PLS token
    if (normalizedAddresses.includes('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')) {
      const plsPrice = await getTokenPrice('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      if (plsPrice) {
        results['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsPrice;
      }
    }
    
    return results;
  }
  
  console.log(`Found ${normalizedAddresses.length - addressesToFetch.length} prices in cache, fetching ${addressesToFetch.length} from API`);
  
  // Handle native PLS token if needed
  if (normalizedAddresses.includes('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')) {
    const plsPrice = await getTokenPrice('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    if (plsPrice) {
      results['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsPrice;
    }
  }
  
  // If we have no addresses left after handling special cases, return early
  if (addressesToFetch.length === 0) {
    return results;
  }
  
  try {
    // Create an array of token objects required by the Moralis API
    const tokenObjects = addressesToFetch.map(address => ({
      tokenAddress: address
    }));
    
    console.log(`Fetching ${tokenObjects.length} token prices from Moralis in a single batch request`);
    
    // Use the batch price API from Moralis
    const response = await Moralis.EvmApi.token.getMultipleTokenPrices({
      chain: "0x171", // PulseChain's chain ID in hex
      include: "percent_change"
    }, {
      tokens: tokenObjects
    });
    
    console.log(`Successfully fetched ${response.raw.length} token prices in batch`);
    
    // Process each token price and add to results
    for (const priceData of response.raw) {
      if (priceData && typeof priceData.tokenAddress === 'string') {
        const tokenAddress = priceData.tokenAddress.toLowerCase();
        
        // Create a complete response with all required fields
        const completeData: MoralisTokenPriceResponse = {
          tokenName: priceData.tokenName || 'Unknown Token',
          tokenSymbol: priceData.tokenSymbol || 'UNKNOWN',
          tokenDecimals: priceData.tokenDecimals || '18',
          tokenLogo: priceData.tokenLogo || getDefaultLogo(priceData.tokenSymbol),
          nativePrice: priceData.nativePrice || {
            value: "1000000000000000000",
            decimals: 18,
            name: "PLS",
            symbol: "PLS",
            address: PLS_TOKEN_ADDRESS
          },
          usdPrice: priceData.usdPrice || 0,
          usdPriceFormatted: priceData.usdPriceFormatted || '0',
          exchangeName: priceData.exchangeName || 'Unknown Exchange',
          exchangeAddress: priceData.exchangeAddress || '',
          tokenAddress: tokenAddress,
          blockTimestamp: priceData.blockTimestamp || new Date().toISOString(),
          verifiedContract: priceData.verifiedContract || false,
          securityScore: priceData.securityScore || 50
        };
        
        // Cache the result
        cacheService.setTokenPrice(tokenAddress, completeData);
        
        // Add to results
        results[tokenAddress] = completeData;
      }
    }
    
    // Check if we need to use DexScreener for any tokens that weren't found
    const missingAddresses = addressesToFetch.filter(addr => !results[addr]);
    if (missingAddresses.length > 0) {
      console.log(`Using DexScreener for ${missingAddresses.length} tokens not found in Moralis batch`);
      
      // Get DexScreener prices for missing tokens - process one at a time
      for (const address of missingAddresses) {
        try {
          // Individual DexScreener requests
          const dexScreenerPrice = await getTokenPriceFromDexScreener(address);
          
          if (dexScreenerPrice !== null && typeof dexScreenerPrice === 'number') {
            // Get token metadata if available
            let symbol = '';
            let name = '';
            let logoUrl = null;
            
            try {
              const storedLogo = await storage.getTokenLogo(address);
              if (storedLogo) {
                symbol = storedLogo.symbol || '';
                name = storedLogo.name || '';
                logoUrl = storedLogo.logoUrl;
              }
            } catch (logoErr) {
              // Silently handle errors
            }
            
            // Create a Moralis-like response
            const result: MoralisTokenPriceResponse = {
              tokenName: name || 'Unknown Token',
              tokenSymbol: symbol || 'UNKNOWN',
              tokenDecimals: "18",
              tokenLogo: logoUrl || getDefaultLogo(symbol),
              nativePrice: {
                value: "1000000000000000000",
                decimals: 18,
                name: "PLS",
                symbol: "PLS",
                address: PLS_TOKEN_ADDRESS
              },
              usdPrice: dexScreenerPrice,
              usdPriceFormatted: dexScreenerPrice.toString(),
              exchangeName: "DexScreener (Individual)",
              exchangeAddress: "",
              tokenAddress: address,
              blockTimestamp: new Date().toISOString(),
              verifiedContract: false,
              securityScore: 50
            };
            
            // Cache and add to results
            cacheService.setTokenPrice(address, result);
            results[address] = result;
          }
        } catch (dexScreenerError) {
          console.error(`Error fetching price from DexScreener for ${address}:`, dexScreenerError);
        }
          
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error fetching multiple token prices from Moralis:', error);
    
    // Fall back to individual requests for tokens that weren't found in cache
    console.log(`Falling back to individual price requests for ${addressesToFetch.length} tokens`);
    
    // Process in smaller batches to avoid rate limiting
    const FALLBACK_BATCH_SIZE = 5;
    
    for (let i = 0; i < addressesToFetch.length; i += FALLBACK_BATCH_SIZE) {
      const batchAddresses = addressesToFetch.slice(i, i + FALLBACK_BATCH_SIZE);
      
      await Promise.all(batchAddresses.map(async (address: string) => {
        try {
          const priceData = await getTokenPrice(address);
          if (priceData) {
            results[address] = priceData;
          }
        } catch (err) {
          console.error(`Error in fallback individual price fetch for ${address}:`, err);
        }
      }));
      
      // Add delay between batches
      if (i + FALLBACK_BATCH_SIZE < addressesToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
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
    dai: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png', // DAI logo
    pdai: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png', // pDAI logo
  };
  
  return defaultLogos[symbolLower] || 'https://cryptologos.cc/logos/placeholder-logo.png';
}

/**
 * Get wallet balance using Moralis API 
 * (includes native PLS and ERC20 tokens with pricing data)
 */
export async function getWalletTokenBalancesFromMoralis(walletAddress: string): Promise<any> {
  try {
    // Track API call
    trackApiCall(walletAddress, 'getWalletTokenBalancesFromMoralis');
    console.log(`Fetching wallet balances with price for ${walletAddress} from Moralis`);
    
    const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
      chain: "0x171", // PulseChain chain hex ID
      address: walletAddress
    });
    
    console.log(`Successfully fetched wallet balances with price for ${walletAddress}`);
    
    // Enhanced debugging
    const result = response.raw;
    console.log(`Got response from Moralis with type: ${typeof result}`);
    
    // Check if we have a native token (PLS)
    if (Array.isArray(result)) {
      // Log item count
      console.log(`Moralis returned ${result.length} tokens`);
      
      // Look for PLS token in different ways
      const nativeToken = result.find((token: any) => token.native_token === true);
      const plsSymbol = result.find((token: any) => token.symbol && token.symbol.toLowerCase() === 'pls');
      const plsAddress = result.find((token: any) => token.token_address && 
                                      (token.token_address.toLowerCase() === PLS_TOKEN_ADDRESS.toLowerCase() || 
                                       token.token_address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'));
      
      // Log what we found
      if (nativeToken) {
        console.log(`Found native PLS by native_token flag: ${nativeToken.symbol}, address: ${nativeToken.token_address}, balance: ${nativeToken.balance_formatted}`);
      }
      
      if (plsSymbol) {
        console.log(`Found PLS by symbol: address=${plsSymbol.token_address}, balance=${plsSymbol.balance_formatted}`);
      }
      
      if (plsAddress) {
        console.log(`Found PLS by address: symbol=${plsAddress.symbol}, balance=${plsAddress.balance_formatted}`);
      }
      
      if (!nativeToken && !plsSymbol && !plsAddress) {
        console.log('PLS token not found in Moralis response by any method');
        
        // Log some token samples to understand structure
        if (result.length > 0) {
          console.log('Sample token data:');
          console.log(JSON.stringify(result[0], null, 2));
        }
      }
    }
    
    // Just return the raw data - we'll handle the structure in the caller
    return result;
  } catch (error: any) {
    console.error('Error fetching wallet balances from Moralis:', error.message);
    return null;
  }
}

/**
 * Get wallet transaction history from Moralis API with pagination support
 * (with caching to reduce API calls)
 */
export async function getWalletTransactionHistory(
  walletAddress: string, 
  limit: number = 100, // Moralis free plan limits to max 100 transactions per call
  cursorParam: string | null = null
): Promise<any> {
  // Normalize wallet address for consistent caching
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check cache first to avoid unnecessary API calls
  const cachedData = cacheService.getTransactionData(normalizedAddress, limit, cursorParam);
  if (cachedData) {
    console.log(`Using cached transaction data for ${normalizedAddress} with cursor: ${cursorParam || 'null'}`);
    return cachedData;
  }
  
  // If we're here, we need to make an API call, so track it
  trackApiCall(walletAddress, 'getWalletTransactionHistory');
  
  // Add retry logic - maximum 3 attempts with increasing delay
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Fetching transaction history for ${normalizedAddress} from Moralis (attempt ${attempt}/${MAX_RETRIES}, limit: ${limit}, cursor: ${cursorParam || 'none'})`);
      
      // Direct API call to Moralis as shown in the working example
      const apiKey = MORALIS_API_KEY;
      if (!apiKey) {
        throw new Error("MORALIS_API_KEY environment variable is required");
      }
      
      // Build URL with parameters
      let url = `https://deep-index.moralis.io/api/v2.2/wallets/${normalizedAddress}/history`;
      
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
      const responseData = await response.json() as {
        result?: any[];
        cursor?: string | null;
        page?: number;
        page_size?: number;
      };
      
      console.log(`Transaction response cursor: ${responseData?.cursor || 'none'}`);
      
      // Safely check if responseData is an object before calling Object.keys
      if (responseData && typeof responseData === 'object') {
        console.log('Response data keys:', Object.keys(responseData));
      }
      
      let result = responseData?.result || [];
      const cursor = responseData?.cursor || null;
      const page = responseData?.page || 0;
      const page_size = responseData?.page_size || limit;
      
      // Process transaction data to add direction property to transfers
      result = result.map((tx: any) => {
        // Process ERC20 transfers to add direction
        if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
          tx.erc20_transfers = tx.erc20_transfers.map((transfer: any) => {
            // Set direction based on from/to addresses
            const isReceiving = transfer.to_address.toLowerCase() === normalizedAddress;
            const isSending = transfer.from_address.toLowerCase() === normalizedAddress;
            
            return {
              ...transfer,
              direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
            };
          });
        }
        
        // Process native transfers to add direction
        if (tx.native_transfers && tx.native_transfers.length > 0) {
          tx.native_transfers = tx.native_transfers.map((transfer: any) => {
            // Set direction based on from/to addresses
            const isReceiving = transfer.to_address.toLowerCase() === normalizedAddress;
            const isSending = transfer.from_address.toLowerCase() === normalizedAddress;
            
            return {
              ...transfer,
              direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
            };
          });
        }
        
        return tx;
      });
      
      console.log(`Successfully fetched transaction history for ${normalizedAddress} - ${result.length} transactions`);
      console.log('First transaction sample:', result.length > 0 ? JSON.stringify(result[0]).substring(0, 300) : 'No transactions');
      
      // Prepare the response data
      const responseObject = {
        result,
        cursor,
        page,
        page_size
      };
      
      // Cache the result before returning
      cacheService.setTransactionData(normalizedAddress, limit, cursorParam, responseObject);
      
      // Success - return the processed data
      return responseObject;
      
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
 * (with caching to reduce API calls)
 * @param walletAddress The wallet address to fetch data for
 * @param page Page number for pagination (1-based)
 * @param limit Number of tokens per page
 * @param forceRefresh Set to true to bypass cache and fetch fresh data
 */
export async function getWalletData(walletAddress: string, page: number = 1, limit: number = 100, forceRefresh: boolean = false): Promise<WalletData> {
  // Normalize wallet address for consistent caching
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Track this as the main wallet search API call
  trackApiCall(walletAddress, 'getWalletData');
  
  // Check cache first to avoid unnecessary API calls (unless force refresh is requested)
  if (!forceRefresh) {
    const cachedWalletData = cacheService.getWalletData(normalizedAddress);
    if (cachedWalletData) {
      console.log(`Using cached wallet data for ${normalizedAddress}`);
      
      // Still update loading progress for UI
      updateLoadingProgress({
        status: 'complete',
        currentBatch: 1,
        totalBatches: 1,
        message: 'Using cached wallet data...'
      });
      
      return cachedWalletData;
    }
  } else {
    console.log(`Force refresh requested for ${normalizedAddress}, bypassing cache`);
    // Invalidate any existing cache for this wallet
    cacheService.invalidateWalletData(normalizedAddress);
    
    // Update loading progress for UI
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 5,
      message: 'Force refreshing wallet data from blockchain...'
    });
  }
  
  try {
    // Initialize loading progress at the start with a reasonable estimate of total batches
    // Use an initial high count to show progress for the entire process
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 50, // Start with a high estimate that will be refined as we go
      message: 'Initializing wallet data fetch...'
    });
    
    // Get native PLS balance directly from Moralis API (more reliable and faster)
    console.log(`Getting native PLS balance for ${normalizedAddress}`);
    
    // Update progress
    updateLoadingProgress({
      currentBatch: 2,
      message: 'Fetching native PLS balance...'
    });
    
    let nativePlsBalance = await getNativePlsBalance(normalizedAddress);
    console.log(`Native PLS balance from direct API call: ${nativePlsBalance?.balanceFormatted || 'Not found'}`);
    
    // Try to get token data from Moralis (includes other tokens with prices)
    // Update progress
    updateLoadingProgress({
      currentBatch: 3,
      message: 'Fetching token data from Moralis...'
    });
    
    const moralisData = await getWalletTokenBalancesFromMoralis(normalizedAddress);
    
    // If we have Moralis data, use it
    // Check if moralisData is an array (direct result) or has a result property
    const moralisTokens = Array.isArray(moralisData) ? moralisData : 
                         (moralisData && moralisData.result) ? moralisData.result : [];
                         
    if (moralisTokens.length > 0) {
      console.log(`Got wallet data from Moralis with ${moralisTokens.length} tokens`);
      
      // Configuration for spam filtering
      const filterSpamTokens = true; // Set this to true to filter out spam tokens
      
      // Filter out possible spam tokens if enabled
      let filteredTokens = moralisTokens;
      if (filterSpamTokens) {
        const originalCount = moralisTokens.length;
        filteredTokens = moralisTokens.filter((item: any) => {
          return item.possible_spam !== true;
        });
        const removedCount = originalCount - filteredTokens.length;
        if (removedCount > 0) {
          console.log(`Removed ${removedCount} possible spam tokens from results`);
        }
      }
      
      // Process tokens in batches to avoid overwhelming API
      const BATCH_SIZE = 15; // Process 15 tokens at a time (increased from 5 for faster loading)
      const processedTokens: ProcessedToken[] = [];
      const totalBatches = Math.ceil(filteredTokens.length/BATCH_SIZE);
      
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
      for (let i = 0; i < filteredTokens.length; i += BATCH_SIZE) {
        const currentBatch = Math.floor(i/BATCH_SIZE) + 1;
        console.log(`Processing token batch ${currentBatch}/${totalBatches}`);
        
        // Update loading progress - add the offset to maintain continuous progress
        updateLoadingProgress({
          currentBatch: currentBatch + 5, // Add 5 to account for previous steps
          message: `Processing token batch ${currentBatch}/${totalBatches}...`
        });
        
        const batch = filteredTokens.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (item: any) => {
          try {
            // Check if this is the native PLS token (has address 0xeeee...eeee and native_token flag)
            const isNative = item.native_token === true || 
                            (item.token_address && item.token_address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
            
            // Fix the incorrect label of native PLS token (Moralis returns it as WPLS)
            // Fix incorrect labeling for the native PLS token
            let symbol = item.symbol || 'UNKNOWN';
            let name = item.name || 'Unknown Token';
          
          if (isNative && symbol.toLowerCase() === 'wpls') {
            symbol = 'PLS'; // Correct the symbol for native token
            name = 'PulseChain'; // Correct the name too
            console.log('Corrected native token from WPLS/Wrapped Pulse to PLS/PulseChain');
            
            // For native PLS token, try to get more accurate price data from wPLS contract
            try {
              const plsPrice = await getNativePlsPrice();
              if (plsPrice) {
                // Update the token with more accurate price data
                item.usd_price = plsPrice.price;
                item.usd_price_24hr_percent_change = plsPrice.priceChange24h;
                console.log(`Updated native PLS price to ${plsPrice.price} USD with 24h change of ${plsPrice.priceChange24h}%`);
              }
            } catch (plsPriceError) {
              console.error('Error fetching PLS price from wPLS contract:', plsPriceError);
            }
          }
          
          let logoUrl = item.logo || null;
          
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
                name, // Use our corrected name for native token
                lastUpdated: new Date().toISOString()
              };
              
              await storage.saveTokenLogo(newLogo);
            } catch (storageError) {
              console.error(`Error storing logo for token ${item.token_address}:`, storageError);
            }
          }
          
          return {
            address: item.token_address,
            symbol,
            name, // Use our corrected name for native token
            decimals: parseInt(item.decimals || '18'),
            balance: item.balance || '0',
            balanceFormatted: parseFloat(item.balance_formatted || '0'),
            price: item.usd_price,
            value: item.usd_value,
            priceChange24h: item.usd_price_24hr_percent_change,
            logo: logoUrl,
            exchange: '', // Moralis doesn't provide exchange info in this endpoint
            verified: item.verified_contract === true,
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
      
      // Try to get accurate PLS price from wPLS contract
      const plsPrice = await getNativePlsPrice();
      const plsPriceUsd = plsPrice?.price || PLS_PRICE_USD;
      const plsPriceChange = plsPrice?.priceChange24h || 0;
      
      console.log(`Using PLS price: ${plsPriceUsd} USD, 24h change: ${plsPriceChange}%`);
      
      // Add native PLS token to the beginning of the token list with accurate price
      tokens.unshift({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: nativePlsBalance.balance,
        balanceFormatted: nativePlsBalance.balanceFormatted,
        price: plsPriceUsd,
        value: nativePlsBalance.balanceFormatted * plsPriceUsd,
        priceChange24h: plsPriceChange,
        logo: getDefaultLogo('pls'),
        exchange: 'PulseX',
        verified: true,
        securityScore: 100,
        isNative: true
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
    let tokensWithPrice: ProcessedToken[] = [];
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
      // First, preload all logos from the database
      const tokenAddresses = batch.map(token => token.address);
      const storedLogos: Record<string, TokenLogo> = {};
      
      try {
        // Get all stored logos in one batch
        const allLogos = await Promise.all(
          tokenAddresses.map(address => storage.getTokenLogo(address))
        );
        
        // Create a lookup map for logos
        allLogos.forEach((logo, index) => {
          if (logo) {
            storedLogos[tokenAddresses[index].toLowerCase()] = logo;
          }
        });
        
        console.log(`Retrieved ${Object.keys(storedLogos).length} token logos from database`);
      } catch (error) {
        console.error('Error retrieving stored logos:', error);
      }
      
      // Only get prices for tokens that are missing price data
      // Filter for tokens that don't already have price data from the first call
      const tokensNeedingPrices = batch.filter(token => token.price === undefined);
      const addressesNeedingPrices = tokensNeedingPrices.map(token => token.address);
      
      let priceDataMap: Record<string, any> = {};
      
      if (addressesNeedingPrices.length > 0) {
        console.log(`Fetching prices for ${addressesNeedingPrices.length} tokens without price data in batch...`);
        priceDataMap = await getMultipleTokenPrices(addressesNeedingPrices);
        console.log(`Retrieved prices for ${Object.keys(priceDataMap).length} tokens in batch`);
      } else {
        console.log('All tokens in batch already have price data, skipping batch price fetch');
      }
      
      // Process each token with the retrieved data
      const batchResults = await Promise.all(batch.map(async (token) => {
        try {
          // First, try to get logo from our database
          let logoUrl = token.logo;
          const normalizedAddress = token.address.toLowerCase();
          const storedLogo = storedLogos[normalizedAddress];
          
          if (storedLogo) {
            logoUrl = storedLogo.logoUrl;
          }
          
          // Get price data from our batch results
          const priceData = priceDataMap[normalizedAddress];
          
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
    
    // ENHANCEMENT: Try a more direct Moralis API call to make sure we're getting the latest data
    // This is more reliable than PulseChain Explorer API and shows new tokens faster
    try {
      console.log("Double-checking token balances with direct Moralis API...");
      updateLoadingProgress({
        currentBatch: totalBatches + 6, 
        totalBatches: totalBatches + 7,
        message: 'Refreshing token balances via Moralis...'
      });
      
      // Make a direct API call to Moralis for the most up-to-date token balances
      console.log(`Making direct Moralis API call for wallet: ${walletAddress}`);
      
      try {
        // Direct API call to Moralis to get all tokens for the wallet
        const moralisTokensResponse = await Moralis.EvmApi.token.getWalletTokenBalances({
          chain: "0x171", // PulseChain chain ID
          address: walletAddress,
        });
        
        if (moralisTokensResponse && moralisTokensResponse.raw) {
          const moralisTokens = moralisTokensResponse.raw;
          console.log(`Moralis direct API call returned ${moralisTokens.length} tokens`);
          
          // Get existing token addresses for comparison
          const existingTokenAddresses = tokensWithPrice.map(t => t.address.toLowerCase());
          const missingTokens: ProcessedToken[] = [];
          
          // First, filter out tokens that we need to process (new tokens)
          const newTokens = moralisTokens.filter(token => 
            token && token.token_address && 
            !existingTokenAddresses.includes(token.token_address.toLowerCase())
          );
          
          if (newTokens.length > 0) {
            console.log(`Found ${newTokens.length} new tokens from Moralis API that aren't in the balance list`);
            
            // Step 1: Gather all token addresses to fetch prices in a batch
            const newTokenAddresses = newTokens.map(token => token.token_address);
            
            // Step 2: Get all logos from database in a batch
            const logoLookup: Record<string, TokenLogo> = {};
            try {
              const storedLogos = await Promise.all(
                newTokenAddresses.map(address => storage.getTokenLogo(address))
              );
              
              // Create lookup map
              storedLogos.forEach((logo, index) => {
                if (logo) {
                  logoLookup[newTokenAddresses[index].toLowerCase()] = logo;
                }
              });
              
              console.log(`Retrieved ${Object.keys(logoLookup).length} stored logos for new tokens`);
            } catch (error) {
              console.error('Error fetching stored logos for new tokens:', error);
            }
            
            // Step 3: Get all token prices in one batch request
            console.log(`Fetching prices for ${newTokenAddresses.length} new tokens in a batch...`);
            const priceDataMap = await getMultipleTokenPrices(newTokenAddresses);
            console.log(`Retrieved prices for ${Object.keys(priceDataMap).length} new tokens`);
            
            // Step 4: Process each token with the data we've gathered
            for (const token of newTokens) {
              try {
                console.log(`Processing new token ${token.symbol || 'Unknown'} (${token.token_address})`);
                
                // Process token data
                const decimals = parseInt(String(token.decimals) || '18') || 18;
                const balance = token.balance || '0';
                const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
                
                // Get logo and other details
                let price: number | undefined = undefined;
                let priceChange: number | undefined = undefined;
                const normalizedAddress = token.token_address.toLowerCase();
                
                // Attempt to get price info if available in Moralis response
                if ('usd_price' in token && typeof token.usd_price === 'number') {
                  price = token.usd_price;
                }
                
                if ('usd_price_24hr_percent_change' in token && typeof token.usd_price_24hr_percent_change === 'number') {
                  priceChange = token.usd_price_24hr_percent_change;
                }
                
                let logoUrl = token.logo || token.thumbnail || null;
                
                // If no price from Moralis response, get it from our batch price data
                if (!price && priceDataMap[normalizedAddress]) {
                  const priceData = priceDataMap[normalizedAddress];
                  price = priceData.usdPrice;
                  priceChange = priceData.usdPrice24hrPercentChange;
                  
                  // If no logo yet, use from price data
                  if (!logoUrl && priceData.tokenLogo) {
                    logoUrl = priceData.tokenLogo;
                  }
                }
                
                // If still no logo, try from our database lookup
                if (!logoUrl && logoLookup[normalizedAddress]) {
                  logoUrl = logoLookup[normalizedAddress].logoUrl;
                }
                
                // If still no logo, use default
                if (!logoUrl) {
                  logoUrl = getDefaultLogo(token.symbol);
                }
                
                // Create processed token object
                missingTokens.push({
                  address: token.token_address,
                  symbol: token.symbol || 'Unknown',
                  name: token.name || 'Unknown Token',
                  decimals,
                  balance,
                  balanceFormatted,
                  price,
                  value: price ? balanceFormatted * price : undefined,
                  priceChange24h: priceChange,
                  logo: logoUrl,
                  verified: token.verified_contract === true,
                  securityScore: 'security_score' in token ? (token.security_score as number) : undefined,
                  isNative: false
                });
                
                // Store logo in our database if we have one and it's not a default asset
                if (logoUrl && !logoUrl.startsWith('/assets/') && !logoLookup[normalizedAddress]) {
                  try {
                    const newLogo: InsertTokenLogo = {
                      tokenAddress: token.token_address,
                      logoUrl,
                      symbol: token.symbol || 'Unknown',
                      name: token.name || 'Unknown Token',
                      lastUpdated: new Date().toISOString()
                    };
                    
                    await storage.saveTokenLogo(newLogo);
                  } catch (storageError) {
                    console.error(`Error storing logo for token ${token.token_address}:`, storageError);
                  }
                }
                
                // Add to existing addresses to avoid duplicates
                existingTokenAddresses.push(normalizedAddress);
              } catch (tokenError) {
                console.error('Error processing token from Moralis API:', tokenError);
              }
            }
          }
          
          // Add missing tokens to the main list
          if (missingTokens.length > 0) {
            console.log(`Adding ${missingTokens.length} tokens from Moralis API to balance list`);
            tokensWithPrice.push(...missingTokens);
            
            // Recalculate total value including new tokens
            totalValue = tokensWithPrice.reduce((sum, token) => {
              return sum + (token.value || 0);
            }, 0);
          }
        } else {
          console.log('Moralis API call did not return any tokens or had invalid response format');
        }
      } catch (moralisError) {
        console.error("Error with Moralis API call:", moralisError);
        // Continue without the Moralis data, we already have tokens from the standard flow
      }
    } catch (tokenError) {
      console.error("Error checking for additional tokens:", tokenError);
      // Continue with the tokens we already have
    }
  
    // Add important tokens that should always be included
    const existingTokenAddresses = tokensWithPrice.map(token => token.address.toLowerCase());
    
    // Update loading progress to indicate we're fetching important tokens
    updateLoadingProgress({
      status: 'loading',
      currentBatch: totalBatches + 7,
      totalBatches: totalBatches + 8,
      message: 'Checking for important tokens...'
    });
    
    // Fetch any important tokens that aren't already in the list - batch process them
    const missingImportantTokens = IMPORTANT_TOKENS.filter(
      tokenAddress => !existingTokenAddresses.includes(tokenAddress.toLowerCase())
    );
    
    if (missingImportantTokens.length > 0) {
      console.log(`Adding ${missingImportantTokens.length} important tokens that weren't in standard results`);
      
      try {
        // Get token balances in parallel
        const tokenDataPromises = missingImportantTokens.map(
          tokenAddress => getSpecificTokenBalance(walletAddress, tokenAddress)
        );
        const tokenDataResults = await Promise.all(tokenDataPromises);
        
        // Filter out any null results and add to the token list
        const validTokenData = tokenDataResults.filter(data => data !== null) as ProcessedToken[];
        
        if (validTokenData.length > 0) {
          tokensWithPrice.push(...validTokenData);
          
          // Update total value
          validTokenData.forEach(token => {
            if (token.value) {
              totalValue += token.value;
            }
          });
          
          console.log(`Successfully added ${validTokenData.length} important tokens`);
        }
      } catch (error) {
        console.error(`Error fetching important tokens in batch:`, error);
      }
    } else {
      console.log('All important tokens already exist in results');
    }
    
    // Process LP tokens to get detailed information about the underlying token pairs
    updateLoadingProgress({
      status: 'loading',
      currentBatch: totalBatches + 8, // Account for previous steps
      totalBatches: totalBatches + 9, // Add one more step for LP processing
      message: 'Processing liquidity pool tokens...'
    });
    
    // Count LP tokens for processing estimation
    const lpTokenCount = tokensWithPrice.filter(token => token.isLp).length;
    console.log(`Found ${lpTokenCount} LP tokens to process`);
    
    if (lpTokenCount > 0) {
      try {
        // Process LP tokens in batches to get details on the underlying token pairs
        const processedTokens = await processLpTokens(tokensWithPrice, walletAddress);
        // Update tokensWithPrice with the processed tokens
        tokensWithPrice = processedTokens;
        console.log(`Processed ${lpTokenCount} LP tokens with detailed pair information`);
      } catch (lpError) {
        console.error('Error processing LP tokens:', lpError);
        // Continue with the original tokens even if LP processing fails
      }
    }
    
    // Update loading progress to complete
    updateLoadingProgress({
      status: 'complete',
      currentBatch: totalBatches + 9, // Account for all steps including LP processing
      totalBatches: totalBatches + 9, // Ensure we have the right total
      message: 'Data loaded successfully'
    });
    
    // Give clients time to see the completed progress
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // First, ensure all tokens have a proper value field for sorting
    tokensWithPrice.forEach(token => {
      // Explicitly calculate the value if not already set
      if (token.value === undefined && token.price !== undefined && token.balanceFormatted !== undefined) {
        token.value = token.price * token.balanceFormatted;
        console.log(`Calculated missing value for ${token.symbol}: ${token.value} USD`);
      }
      
      // If still undefined after calculation, set to 0 to enable proper sorting
      if (token.value === undefined) {
        token.value = 0; 
      }
    });
    
    // Now sort all tokens by value (descending) so most valuable appear first
    tokensWithPrice.sort((a, b) => {
      // Ensure we have definite numbers to sort by (null/undefined protection)
      const aValue = typeof a.value === 'number' ? a.value : 0;
      const bValue = typeof b.value === 'number' ? b.value : 0;
      
      // First, sort by value (highest first)
      if (aValue !== bValue) {
        return bValue - aValue;
      }
      
      // For tokens with equal value, sort by balance (highest first)
      return b.balanceFormatted - a.balanceFormatted;
    });
    
    // Log tokens with significant value for debugging
    console.log('Top tokens sorted by value:');
    
    // Debug all tokens with value over $10
    const significantTokens = tokensWithPrice.filter(t => typeof t.value === 'number' && t.value > 10);
    significantTokens.forEach((token, i) => {
      // Safely handle value and balance formatting with nullish checks
      const value = typeof token.value === 'number' ? token.value : 0;
      const balance = typeof token.balanceFormatted === 'number' ? token.balanceFormatted : 0;
      console.log(`Token ${i+1}: ${token.symbol} = $${value.toFixed(2)} (balance: ${balance.toFixed(4)})`);
    });
    
    // Also log the top 10 tokens
    console.log('First 10 tokens in sorted list:');
    tokensWithPrice.slice(0, 10).forEach((token, i) => {
      console.log(`${i+1}. ${token.symbol}: ${token.value || 0} USD (balance: ${token.balanceFormatted})`);
    });
    
    // Now apply pagination to the sorted tokens
    const totalTokens = tokensWithPrice.length;
    const totalPages = Math.ceil(totalTokens / limit);
    
    // Calculate the start and end indices for slicing the tokens array
    const startIndex = (page - 1) * limit;
    let endIndex = startIndex + limit;
    
    // Ensure endIndex doesn't exceed the array length
    if (endIndex > totalTokens) {
      endIndex = totalTokens;
    }
    
    // Get the paginated tokens
    const paginatedTokens = tokensWithPrice.slice(startIndex, endIndex);
    
    console.log(`Pagination: page ${page}, limit ${limit}, showing tokens ${startIndex + 1}-${endIndex} of ${totalTokens}`);
    
    // Prepare the wallet data response
    const result: WalletData = {
      address: normalizedAddress,
      tokens: paginatedTokens,
      totalValue,
      tokenCount: totalTokens, // Keep the total count, not just the paginated count
      plsBalance: nativePlsBalance?.balanceFormatted || plsToken?.balanceFormatted || null,
      plsPriceChange: plsToken?.priceChange24h || null,
      networkCount: 1, // Default to PulseChain network
      pagination: {
        page,
        limit,
        totalItems: totalTokens,
        totalPages
      }
    };
    
    // Store the full data (not just paginated) in the cache before returning
    // We cache the unpaginated version so we can handle different pagination requests from cache
    const cacheData: WalletData = {
      ...result,
      tokens: tokensWithPrice, // Store all tokens, not just paginated ones
    };
    
    // Cache the wallet data for future requests
    cacheService.setWalletData(normalizedAddress, cacheData);
    console.log(`Cached wallet data for ${normalizedAddress} with ${tokensWithPrice.length} tokens`);
    
    return result;
  } catch (error) {
    console.error('Error in getWalletData:', error);
    
    // Update loading progress to error state
    updateLoadingProgress({
      status: 'error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
    
    // Return a minimal valid response rather than throwing
    // This helps prevent UI errors while still indicating the problem
    return {
      address: normalizedAddress,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: null,
      plsPriceChange: null,
      networkCount: 0
    };
  }
}
