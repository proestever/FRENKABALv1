import fetch from 'node-fetch';
import Moralis from 'moralis';
import { ProcessedToken, PulseChainTokenBalanceResponse, PulseChainTokenBalance, MoralisTokenPriceResponse, WalletData } from '../types';
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
      throw new Error(`PulseChain Scan API error: ${response.status} ${response.statusText}`);
    }
    
    // The API returns an array of token balances directly
    const tokenBalances = await response.json() as PulseChainTokenBalanceResponse;
    
    if (!Array.isArray(tokenBalances)) {
      console.error('Unexpected response format:', tokenBalances);
      return [];
    }
    
    return tokenBalances.map((item: PulseChainTokenBalance) => {
      const decimals = parseInt(item.token.decimals) || 18;
      const balance = item.value;
      const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
      
      return {
        address: item.token.address,
        symbol: item.token.symbol,
        name: item.token.name,
        decimals,
        balance,
        balanceFormatted,
        logo: item.token.icon_url || getDefaultLogo(item.token.symbol),
      };
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
    // Using Moralis SDK to get token price with PulseChain's chain ID (369 or 0x171)
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: "0x171", // PulseChain's chain ID in hex
      include: "percent_change",
      address: tokenAddress
    });
    
    return response.raw as MoralisTokenPriceResponse;
  } catch (error) {
    console.error(`Error fetching price for token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get default logo URL for common tokens
 */
function getDefaultLogo(symbol: string): string {
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
 * Get full wallet data including token balances and prices
 */
export async function getWalletData(walletAddress: string): Promise<WalletData> {
  try {
    // Get token balances
    const tokens = await getTokenBalances(walletAddress);
    
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
