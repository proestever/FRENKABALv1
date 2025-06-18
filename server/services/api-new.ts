import fetch from 'node-fetch';
import { 
  ProcessedToken, 
  PulseChainTokenBalanceResponse, 
  PulseChainTokenBalance,
  PulseChainAddressResponse, 
  TokenPriceResponse,
  WalletData 
} from '../types';
import { storage } from '../storage';
import { InsertTokenLogo, TokenLogo } from '@shared/schema';
import { updateLoadingProgress } from '../routes';
import { processLpTokens } from './lp-token-service';
import { cacheService } from './cache-service';
import { apiStatsService } from './api-stats-service';
import { getTokenPriceFromDexScreener, getTokenPriceDataFromDexScreener, getWalletBalancesFromPulseChainScan } from './dexscreener';

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
  const responseTime = startTime ? Date.now() - startTime : null;
  
  apiCallCounter.total++;
  
  if (!apiCallCounter.byEndpoint[endpoint]) {
    apiCallCounter.byEndpoint[endpoint] = 0;
  }
  apiCallCounter.byEndpoint[endpoint]++;
  
  if (walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    if (!apiCallCounter.byWallet[normalizedAddress]) {
      apiCallCounter.byWallet[normalizedAddress] = 0;
    }
    apiCallCounter.byWallet[normalizedAddress]++;
  }
  
  console.log(`[API Counter] Total calls: ${apiCallCounter.total}, Endpoint: ${endpoint}, Wallet: ${walletAddress || 'n/a'}`);
  
  try {
    apiStatsService.recordApiCall(
      endpoint,
      walletAddress, 
      responseTime,
      false,
      true,
      null
    ).catch(err => {
      console.error('[API Counter] Failed to record API call to database:', err);
    });
  } catch (error) {
    console.error('[API Counter] Error persisting API call stats:', error);
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

// Using DexScreener and PulseChain Scan APIs only - no external dependencies
console.log("API service initialized with DexScreener and PulseChain Scan");

// Constants
const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; 
const PLS_CONTRACT_ADDRESS = '0x5616458eb2bAc88dD60a4b08F815F37335215f9B';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const PLS_DECIMALS = 18;

/**
 * Get native PLS balance for a wallet address using PulseChain Scan API
 */
export async function getNativePlsBalance(walletAddress: string): Promise<{balance: string, balanceFormatted: number} | null> {
  try {
    trackApiCall(walletAddress, 'getNativePlsBalance');
    console.log(`Fetching native PLS balance for ${walletAddress} from PulseChain Scan API`);
    
    const response = await fetch(`${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json() as PulseChainAddressResponse;
    const balance = data.coin_balance || '0';
    const balanceFormatted = parseFloat(balance) / Math.pow(10, PLS_DECIMALS);
    
    console.log(`Native PLS balance for ${walletAddress}: ${balanceFormatted} PLS`);
    return { balance, balanceFormatted };
  } catch (error) {
    console.error(`Error fetching native PLS balance for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Get token price from DexScreener with proper error handling
 */
export async function getTokenPrice(tokenAddress: string): Promise<TokenPriceResponse | null> {
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Check cache first
  const cachedPrice = cacheService.getTokenPrice(normalizedAddress);
  if (cachedPrice) {
    console.log(`Using cached price for ${normalizedAddress}: ${cachedPrice.usdPrice} USD`);
    return cachedPrice;
  }
  
  console.log(`Cache miss for token price: ${normalizedAddress}`);
  trackApiCall(null, 'getTokenPrice');
  
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
      
      // Create a response structure with the DexScreener price
      const result: TokenPriceResponse = {
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
        verifiedContract: false,
        securityScore: 50
      };
      
      // Cache the result
      cacheService.setTokenPrice(normalizedAddress, result);
      return result;
    } else {
      console.log(`DexScreener didn't return price for ${normalizedAddress}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching price from DexScreener for ${normalizedAddress}:`, error);
    return null;
  }
}

/**
 * Get wallet data using PulseChain Scan API and DexScreener for prices
 */
export async function getWalletData(
  walletAddress: string, 
  page: number = 1, 
  limit: number = 100
): Promise<WalletData> {
  try {
    console.log(`Fetching wallet data for ${walletAddress} using PulseChain Scan + DexScreener`);
    
    // Get wallet balances from PulseChain Scan
    const walletBalances = await getWalletBalancesFromPulseChainScan(walletAddress);
    
    // Process native PLS balance
    const nativeBalance = parseFloat(walletBalances.nativeBalance) / Math.pow(10, PLS_DECIMALS);
    
    // Get PLS price from DexScreener (using WPLS)
    let plsPrice = 0;
    const plsPriceData = await getTokenPriceFromDexScreener(WPLS_CONTRACT_ADDRESS);
    if (plsPriceData) {
      plsPrice = plsPriceData;
    }
    
    // Process tokens
    const tokens: ProcessedToken[] = [];
    
    // Add native PLS as first token
    tokens.push({
      address: PLS_TOKEN_ADDRESS,
      symbol: 'PLS',
      name: 'PulseChain',
      decimals: PLS_DECIMALS,
      balance: walletBalances.nativeBalance,
      balanceFormatted: nativeBalance,
      price: plsPrice,
      value: nativeBalance * plsPrice,
      logo: getDefaultLogo('PLS'),
      isNative: true,
      verified: true
    });
    
    // Process ERC20 tokens
    for (const tokenBalance of walletBalances.tokenBalances) {
      const decimals = parseInt(tokenBalance.decimals || '18');
      const balance = parseFloat(tokenBalance.balance) / Math.pow(10, decimals);
      
      if (balance > 0) {
        const tokenPrice = await getTokenPriceFromDexScreener(tokenBalance.address);
        
        tokens.push({
          address: tokenBalance.address,
          symbol: tokenBalance.symbol || 'UNKNOWN',
          name: tokenBalance.name || 'Unknown Token',
          decimals,
          balance: tokenBalance.balance,
          balanceFormatted: balance,
          price: tokenPrice || 0,
          value: balance * (tokenPrice || 0),
          logo: getDefaultLogo(tokenBalance.symbol || ''),
          verified: false
        });
      }
    }
    
    // Sort by value
    tokens.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Calculate total value
    const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedTokens = tokens.slice(startIndex, startIndex + limit);
    
    return {
      address: walletAddress,
      tokens: paginatedTokens,
      totalValue,
      tokenCount: tokens.length,
      plsBalance: nativeBalance,
      plsPriceChange: null,
      networkCount: 1,
      pagination: {
        page,
        limit,
        totalItems: tokens.length,
        totalPages: Math.ceil(tokens.length / limit)
      }
    };
  } catch (error) {
    console.error(`Error fetching wallet data for ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Helper function to get default logo URL
 */
function getDefaultLogo(symbol: string): string {
  const symbolLower = symbol.toLowerCase();
  
  // Common token logos
  const logoMap: Record<string, string> = {
    'pls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'wpls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'plsx': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c5D52810B6f40.png',
    'hex': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
    'inc': 'https://tokens.app.pulsex.com/images/tokens/0x6c203a555824ec90a215f37916cf8db58ebe2fa3.png'
  };
  
  return logoMap[symbolLower] || `https://tokens.app.pulsex.com/images/tokens/default.png`;
}

/**
 * Batch get token prices
 */
export async function getTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  for (const address of addresses) {
    const price = await getTokenPriceFromDexScreener(address);
    if (price !== null) {
      results[address.toLowerCase()] = price;
    }
  }
  
  return results;
}