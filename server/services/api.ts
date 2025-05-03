import fetch from 'node-fetch';
import Moralis from 'moralis';
import { 
  ProcessedToken, 
  PulseChainTokenBalanceResponse, 
  PulseChainTokenBalance, 
  MoralisTokenPriceResponse, 
  MoralisWalletTokenBalancesResponse,
  WalletData 
} from '../types';
import { storage } from '../storage';
import { InsertTokenLogo } from '@shared/schema';

// Constants
const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImVkN2E1ZDg1LTBkOWItNGMwYS1hZjgxLTc4MGJhNTdkNzllYSIsIm9yZ0lkIjoiNDI0Nzk3IiwidXNlcklkIjoiNDM2ODk0IiwidHlwZUlkIjoiZjM5MGFlMWYtNGY3OC00MzViLWJiNmItZmVhODMwNTdhMzAzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYzOTQ2MzgsImV4cCI6NDg5MjE1NDYzOH0.AmaeD5gXY-0cE-LAGH6TTucbI6AxQ5eufjqXKMc_u98';
const PLS_TOKEN_ADDRESS = '0x5616458eb2bAc88dD60a4b08F815F37335215f9B'; // PulseChain native token

// Initialize Moralis
try {
  Moralis.start({
    apiKey: MORALIS_API_KEY
  }).then(() => console.log('Moralis initialized successfully'));
} catch (error) {
  console.error('Failed to initialize Moralis:', error);
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
  const defaultLogos: Record<string, string> = {
    pls: 'https://cryptologos.cc/logos/pulse-pls-logo.png',
    hex: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2469.png',
    phex: 'https://cryptologos.cc/logos/hex-hex-logo.png',
    peth: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    pbnb: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  };
  
  return defaultLogos[symbolLower] || 'https://cryptologos.cc/logos/placeholder-logo.png';
}

/**
 * Get wallet balance using Moralis API 
 * (includes native PLS and ERC20 tokens with pricing data)
 */
export async function getWalletTokenBalancesFromMoralis(walletAddress: string): Promise<any> {
  try {
    console.log(`Fetching wallet balances with price for ${walletAddress} from Moralis`);
    
    const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
      chain: "pulse", // PulseChain
      address: walletAddress
    });
    
    console.log(`Successfully fetched wallet balances with price for ${walletAddress}`);
    
    // For debugging
    console.log(`Got response from Moralis with type: ${typeof response.raw}`);
    
    // Just return the raw data - we'll handle the structure in the caller
    return response.raw;
  } catch (error: any) {
    console.error('Error fetching wallet balances from Moralis:', error.message);
    return null;
  }
}

/**
 * Get full wallet data including token balances and prices
 */
export async function getWalletData(walletAddress: string): Promise<WalletData> {
  try {
    // Try to get data from Moralis first (includes PLS and tokens with prices)
    const moralisData = await getWalletTokenBalancesFromMoralis(walletAddress);
    
    // If we have Moralis data, use it
    // Check if moralisData is an array (direct result) or has a result property
    const moralisTokens = Array.isArray(moralisData) ? moralisData : 
                         (moralisData && moralisData.result) ? moralisData.result : [];
                         
    if (moralisTokens.length > 0) {
      console.log(`Got wallet data from Moralis with ${moralisTokens.length} tokens`);
      
      // Process tokens from Moralis
      const processedTokens = await Promise.all(moralisTokens.map(async (item: any) => {
        try {
          const isNative = item.native_token === true;
          const symbol = item.symbol || 'UNKNOWN';
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
                name: item.name || symbol,
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
            name: item.name || 'Unknown Token',
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
      
      // Filter out any null items from processing errors
      const tokens = processedTokens.filter(t => t !== null);
      
      // Find the native PLS token
      const plsToken = tokens.find(token => token.isNative || token.symbol.toLowerCase() === 'pls');
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      return {
        address: walletAddress,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance: plsToken?.balanceFormatted || null,
        plsPriceChange: plsToken?.priceChange24h || null,
        networkCount: 1 // Default to PulseChain network
      };
    }
    
    // Fallback to the original implementation if Moralis data is not available
    console.log('Falling back to PulseChain Scan API for token balances');
    
    // Get token balances from PulseChain Scan API
    const tokens = await getTokenBalances(walletAddress);
    
    // If no tokens found, still return a valid response with empty tokens
    if (tokens.length === 0) {
      console.log(`No tokens found for wallet ${walletAddress}, returning empty data`);
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
    
    // Get prices for each token
    const tokensWithPrice = await Promise.all(
      tokens.map(async (token) => {
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
      })
    );
    
    // Calculate total value
    let totalValue = 0;
    tokensWithPrice.forEach(token => {
      if (token.value) {
        totalValue += token.value;
      }
    });
    
    // Find PLS token (native token)
    const plsToken = tokensWithPrice.find(token => 
      token.symbol.toLowerCase() === 'pls' || 
      token.address.toLowerCase() === PLS_TOKEN_ADDRESS.toLowerCase()
    );
    
    return {
      address: walletAddress,
      tokens: tokensWithPrice,
      totalValue,
      tokenCount: tokens.length,
      plsBalance: plsToken?.balanceFormatted || null,
      plsPriceChange: plsToken?.priceChange24h || null,
      networkCount: 1, // Default to PulseChain network
    };
  } catch (error) {
    console.error('Error in getWalletData:', error);
    throw error;
  }
}
