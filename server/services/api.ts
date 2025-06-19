import fetch from 'node-fetch';
import { 
  ProcessedToken, 
  TokenPriceResponse,
  WalletData,
  Transaction,
  PulseChainAddressResponse
} from '../types';
import { storage } from '../storage';
import { updateLoadingProgress } from '../routes';
import { processLpTokens, isLiquidityPoolToken } from './lp-token-service';
import { cacheService } from './cache-service';
import { apiStatsService } from './api-stats-service';
import { getTokenPriceFromDexScreener, getWalletBalancesFromPulseChainScan } from './dexscreener';

// API call counter
interface ApiCallCounter {
  total: number;
  byWallet: Record<string, number>;
  byEndpoint: Record<string, number>;
  lastReset: number;
}

const apiCallCounter: ApiCallCounter = {
  total: 0,
  byWallet: {},
  byEndpoint: {},
  lastReset: Date.now()
};

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
    ).catch((err: any) => {
      console.error('[API Counter] Failed to record API call to database:', err);
    });
  } catch (error) {
    console.error('[API Counter] Error persisting API call stats:', error);
  }
}

export function resetApiCounter(): ApiCallCounter {
  const result = { ...apiCallCounter };
  apiCallCounter.total = 0;
  apiCallCounter.byWallet = {};
  apiCallCounter.byEndpoint = {};
  apiCallCounter.lastReset = Date.now();
  console.log('[API Counter] Reset completed');
  return result;
}

export function getApiCounterStats(): ApiCallCounter {
  return { ...apiCallCounter };
}

console.log("API service initialized with DexScreener and PulseChain Scan");

// Constants
const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; 
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const PLS_DECIMALS = 18;

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

export async function getWalletTransactionHistory(
  walletAddress: string,
  limit: number = 50,
  cursor?: string | null
): Promise<{ result: Transaction[]; cursor?: string; page?: number; page_size?: number } | null> {
  try {
    trackApiCall(walletAddress, 'getWalletTransactionHistory');
    console.log(`Fetching transaction history for ${walletAddress} from PulseChain Scan API`);
    
    let url = `${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}/transactions?limit=${limit}`;
    
    // Add cursor parameter if provided
    if (cursor) {
      url += `&cursor=${cursor}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Error fetching transaction history: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json() as any;
    
    console.log(`API Response structure:`, Object.keys(data));
    console.log(`Transaction count in response:`, data.items ? data.items.length : 'no items field');
    
    // PulseChain Scan API returns data.items, not data.result
    const transactions_data = data.items || [];
    
    if (!Array.isArray(transactions_data) || transactions_data.length === 0) {
      console.log(`No transaction results found for ${walletAddress}. Response keys:`, Object.keys(data));
      return { result: [], cursor: undefined, page: 1, page_size: limit };
    }
    
    // Transform PulseChain Scan API response to match our Transaction interface
    const transactions: Transaction[] = transactions_data.map((tx: any) => ({
      hash: tx.hash,
      nonce: tx.nonce?.toString() || '0',
      transaction_index: tx.position?.toString() || '0',
      from_address: tx.from?.hash || tx.from_address || '',
      from_address_label: tx.from?.name || null,
      to_address: tx.to?.hash || tx.to_address || '',
      to_address_label: tx.to?.name || null,
      value: tx.value || '0',
      gas: tx.gas_limit?.toString() || '0',
      gas_price: tx.gas_price?.toString() || '0',
      receipt_gas_used: tx.gas_used?.toString() || '0',
      receipt_status: tx.status === 'ok' ? '1' : '0',
      block_timestamp: tx.timestamp || '',
      block_number: tx.block?.toString() || '0',
      transaction_fee: tx.fee?.value?.toString() || '0',
      method_label: tx.method || null,
      // Map token transfers if they exist
      erc20_transfers: tx.token_transfers ? tx.token_transfers.map((transfer: any) => ({
        token_name: transfer.token?.name || null,
        token_symbol: transfer.token?.symbol || null,
        token_logo: transfer.token?.icon_url || null,
        token_decimals: transfer.token?.decimals || null,
        from_address: transfer.from?.hash || '',
        from_address_label: transfer.from?.name || null,
        to_address: transfer.to?.hash || '',
        to_address_label: transfer.to?.name || null,
        address: transfer.token?.address || '',
        log_index: transfer.log_index || 0,
        value: transfer.total?.value || transfer.value || '0',
        value_formatted: transfer.total?.value_formatted || null,
        possible_spam: false,
        verified_contract: transfer.token?.verified || false,
        security_score: null,
        direction: null,
        internal_transaction: false
      })) : [],
      native_transfers: [],
      nft_transfers: [],
      summary: undefined,
      category: tx.tx_types?.[0] || null,
      possible_spam: false
    }));
    
    console.log(`Found ${transactions.length} transactions for ${walletAddress}`);
    
    return {
      result: transactions,
      cursor: data.next_page_params?.cursor || undefined,
      page: 1,
      page_size: limit
    };
  } catch (error) {
    console.error(`Error fetching transaction history for ${walletAddress}:`, error);
    return null;
  }
}

export async function getTokenPrice(tokenAddress: string): Promise<TokenPriceResponse | null> {
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Hardcode only DAI from Ethereum to $1 (the actual DAI stablecoin)
  const stablecoins: Record<string, {symbol: string, name: string}> = {
    '0xefd766ccb38eaf1dfd701853bfce31359239f305': { symbol: 'DAI', name: 'Dai Stablecoin from Ethereum' }
  };
  
  if (stablecoins[normalizedAddress]) {
    const token = stablecoins[normalizedAddress];
    return {
      tokenName: token.name,
      tokenSymbol: token.symbol,
      tokenDecimals: "18",
      tokenLogo: getDefaultLogo(token.symbol),
      nativePrice: {
        value: "1000000000000000000",
        decimals: 18,
        name: "PLS",
        symbol: "PLS",
        address: PLS_TOKEN_ADDRESS
      },
      usdPrice: 1.0,
      usdPriceFormatted: "$1.00",
      exchangeName: "Stablecoin",
      exchangeAddress: "0x0000000000000000000000000000000000000000",
      tokenAddress: normalizedAddress,
      blockTimestamp: new Date().toISOString(),
      verifiedContract: true,
      securityScore: 100
    };
  }
  
  const cachedPrice = cacheService.getTokenPrice(normalizedAddress);
  if (cachedPrice) {
    console.log(`Using cached price for ${normalizedAddress}: ${cachedPrice.usdPrice} USD`);
    return cachedPrice;
  }
  
  console.log(`Cache miss for token price: ${normalizedAddress}`);
  trackApiCall(null, 'getTokenPrice');
  
  try {
    const dexScreenerPrice = await getTokenPriceFromDexScreener(normalizedAddress);
    
    if (dexScreenerPrice !== null) {
      console.log(`Successfully fetched price from DexScreener for ${normalizedAddress}: ${dexScreenerPrice} USD`);
      
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

function getDefaultLogo(symbol: string): string {
  const symbolLower = symbol.toLowerCase();
  
  const logoMap: Record<string, string> = {
    'pls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'wpls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
    'plsx': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c5D52810B6f40.png',
    'hex': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
    'inc': 'https://tokens.app.pulsex.com/images/tokens/0x6c203a555824ec90a215f37916cf8db58ebe2fa3.png'
  };
  
  return logoMap[symbolLower] || `https://tokens.app.pulsex.com/images/tokens/default.png`;
}

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

export async function getWalletDataFull(
  walletAddress: string,
  page: number = 1,
  limit: number = 1000,
  includeZeroBalances: boolean = false
): Promise<WalletData> {
  try {
    const startTime = Date.now();
    trackApiCall(walletAddress, 'getWalletDataFull', startTime);
    
    console.log(`Starting comprehensive wallet data fetch for ${walletAddress}`);
    
    const cacheKey = `${walletAddress}_${page}_${limit}`;
    const cachedData = cacheService.getWalletData(cacheKey);
    if (cachedData) {
      console.log(`Using cached wallet data for ${walletAddress}`);
      return cachedData;
    }

    updateLoadingProgress({
      currentBatch: 1,
      totalBatches: 6,
      status: 'loading',
      message: 'Fetching wallet balances from PulseChain...'
    });

    const walletBalances = await getWalletBalancesFromPulseChainScan(walletAddress);
    
    updateLoadingProgress({
      currentBatch: 2,
      totalBatches: 6,
      status: 'loading',
      message: 'Processing native PLS balance...'
    });

    const nativeBalance = parseFloat(walletBalances.nativeBalance) / Math.pow(10, PLS_DECIMALS);
    
    const plsPriceData = await getTokenPriceFromDexScreener(WPLS_CONTRACT_ADDRESS);
    const plsPrice = plsPriceData || 0;

    updateLoadingProgress({
      currentBatch: 3,
      totalBatches: 6,
      status: 'loading',
      message: 'Processing token balances...'
    });

    const processedTokens: ProcessedToken[] = [];

    processedTokens.push({
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

    updateLoadingProgress({
      currentBatch: 4,
      totalBatches: 6,
      status: 'loading',
      message: 'Fetching token prices...'
    });

    for (const tokenBalance of walletBalances.tokenBalances) {
      const decimals = parseInt(tokenBalance.decimals || '18');
      const balance = parseFloat(tokenBalance.balance) / Math.pow(10, decimals);
      
      if (balance > 0 || includeZeroBalances) {
        const tokenPrice = await getTokenPriceFromDexScreener(tokenBalance.address);
        
        let logoUrl = getDefaultLogo(tokenBalance.symbol || '');
        try {
          let storedLogo = await storage.getTokenLogo(tokenBalance.address);
          
          // If no logo exists, try to fetch from DexScreener
          if (!storedLogo) {
            try {
              const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenBalance.address}`);
              
              if (response.ok) {
                const data = await response.json() as any;
                
                if (data.pairs && data.pairs.length > 0) {
                  const pair = data.pairs[0];
                  const tokenInfo = pair.baseToken.address.toLowerCase() === tokenBalance.address.toLowerCase() 
                    ? pair.baseToken 
                    : pair.quoteToken;
                  
                  let newLogoUrl = getDefaultLogo(tokenBalance.symbol || '');
                  
                  if (tokenInfo.symbol) {
                    const symbol = tokenInfo.symbol.toLowerCase();
                    
                    const knownLogos: Record<string, string> = {
                      'pls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
                      'wpls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
                      'plsx': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c5D52810B6f40.png',
                      'hex': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
                      'weth': 'https://tokens.app.pulsex.com/images/tokens/0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C.png',
                      'usdc': 'https://tokens.app.pulsex.com/images/tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.png',
                      'usdt': 'https://tokens.app.pulsex.com/images/tokens/0xdAC17F958D2ee523a2206206994597C13D831ec7.png',
                      'inc': 'https://tokens.app.pulsex.com/images/tokens/0x6c203a555824ec90a215f37916cf8db58ebe2fa3.png'
                    };
                    
                    if (knownLogos[symbol]) {
                      newLogoUrl = knownLogos[symbol];
                    } else {
                      newLogoUrl = `https://tokens.app.pulsex.com/images/tokens/${tokenBalance.address}.png`;
                    }
                  }
                  
                  // Save the new logo to database for future use
                  const newLogo = {
                    tokenAddress: tokenBalance.address,
                    logoUrl: newLogoUrl,
                    symbol: tokenInfo.symbol || tokenBalance.symbol || "",
                    name: tokenInfo.name || tokenBalance.name || "",
                    lastUpdated: new Date().toISOString()
                  };
                  
                  storedLogo = await storage.saveTokenLogo(newLogo);
                  logoUrl = newLogoUrl;
                } else {
                  // No DexScreener data, save default logo to prevent future API calls
                  const defaultLogo = {
                    tokenAddress: tokenBalance.address,
                    logoUrl: getDefaultLogo(tokenBalance.symbol || ''),
                    symbol: tokenBalance.symbol || "",
                    name: tokenBalance.name || "",
                    lastUpdated: new Date().toISOString()
                  };
                  
                  storedLogo = await storage.saveTokenLogo(defaultLogo);
                  logoUrl = defaultLogo.logoUrl;
                }
              }
            } catch (logoFetchError) {
              // If DexScreener fails, just use default logo
              logoUrl = getDefaultLogo(tokenBalance.symbol || '');
            }
          } else {
            logoUrl = storedLogo.logoUrl;
          }
        } catch (e) {
          // Use default logo if everything fails
          logoUrl = getDefaultLogo(tokenBalance.symbol || '');
        }
        
        processedTokens.push({
          address: tokenBalance.address,
          symbol: tokenBalance.symbol || 'UNKNOWN',
          name: tokenBalance.name || 'Unknown Token',
          decimals,
          balance: tokenBalance.balance,
          balanceFormatted: balance,
          price: tokenPrice || 0,
          value: balance * (tokenPrice || 0),
          logo: logoUrl,
          verified: false
        });
      }
    }

    updateLoadingProgress({
      currentBatch: 5,
      totalBatches: 6,
      status: 'loading',
      message: 'Detecting and processing LP tokens...'
    });

    // Detect actual LP tokens by checking if they implement LP interface
    const potentialLpTokens = processedTokens.filter(token => 
      token.balanceFormatted && token.balanceFormatted > 0 // Only check tokens with balance
    );
    
    console.log(`Checking ${potentialLpTokens.length} tokens for LP interface`);
    
    // Check each token to see if it's an actual LP token
    const detectedLpTokens: ProcessedToken[] = [];
    for (const token of potentialLpTokens) {
      try {
        // Try to call LP token functions to detect if it's an LP token
        const isLpToken = await isLiquidityPoolToken(token.address);
        if (isLpToken) {
          console.log(`Detected LP token: ${token.symbol} (${token.address})`);
          token.isLp = true;
          detectedLpTokens.push(token);
        }
      } catch (error) {
        // Not an LP token, continue
      }
    }
    
    if (detectedLpTokens.length > 0) {
      console.log(`Processing ${detectedLpTokens.length} detected LP tokens`);
      try {
        const processedTokensWithLp = await processLpTokens(processedTokens, walletAddress);
        // Update processedTokens with LP-enhanced data
        processedTokens.splice(0, processedTokens.length, ...processedTokensWithLp);
      } catch (lpError) {
        console.error('Error processing LP tokens:', lpError);
      }
    }

    updateLoadingProgress({
      currentBatch: 6,
      totalBatches: 6,
      status: 'loading',
      message: 'Finalizing results...'
    });

    processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));

    const totalValue = processedTokens.reduce((sum, token) => sum + (token.value || 0), 0);

    // Identify tokens without prices for background fetching
    const tokensWithoutPrices = processedTokens.filter(token => !token.price).map(token => token.address);
    
    // Trigger background batch fetch for missing prices if any
    if (tokensWithoutPrices.length > 0) {
      console.log(`${tokensWithoutPrices.length} tokens missing prices - starting background fetch`);
      
      // Call background batch endpoint asynchronously
      setImmediate(async () => {
        try {
          await fetch('http://localhost:5000/api/token-prices/background-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              addresses: tokensWithoutPrices,
              walletAddress 
            })
          });
        } catch (error) {
          console.error('Error triggering background batch fetch:', error);
        }
      });
    }

    const startIndex = (page - 1) * limit;
    const paginatedTokens = processedTokens.slice(startIndex, startIndex + limit);

    const result: WalletData = {
      address: walletAddress,
      tokens: paginatedTokens,
      totalValue,
      tokenCount: processedTokens.length,
      plsBalance: nativeBalance,
      plsPriceChange: null,
      networkCount: 1,
      pagination: {
        page,
        limit,
        totalItems: processedTokens.length,
        totalPages: Math.ceil(processedTokens.length / limit)
      },
      backgroundFetchTriggered: tokensWithoutPrices.length > 0,
      missingPriceCount: tokensWithoutPrices.length
    };

    cacheService.setWalletData(cacheKey, result);
    
    updateLoadingProgress({
      currentBatch: 6,
      totalBatches: 6,
      status: 'complete',
      message: `Found ${processedTokens.length} tokens with total value $${totalValue.toFixed(2)}`
    });

    console.log(`Wallet data fetch completed for ${walletAddress} in ${Date.now() - startTime}ms`);
    return result;

  } catch (error) {
    console.error(`Error fetching wallet data for ${walletAddress}:`, error);
    updateLoadingProgress({
      currentBatch: 0,
      totalBatches: 0,
      status: 'error',
      message: 'Failed to fetch wallet data'
    });
    throw error;
  }
}

export async function getSpecificTokenBalance(
  walletAddress: string,
  tokenAddress: string
): Promise<{ balance: string, balanceFormatted: number } | null> {
  try {
    trackApiCall(walletAddress, 'getSpecificTokenBalance');
    console.log(`Fetching balance for token ${tokenAddress} in wallet ${walletAddress}`);
    
    const walletBalances = await getWalletBalancesFromPulseChainScan(walletAddress);
    
    // Find the specific token
    const tokenBalance = walletBalances.tokenBalances.find(
      token => token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    
    if (tokenBalance) {
      const decimals = parseInt(tokenBalance.decimals || '18');
      const balance = tokenBalance.balance;
      const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
      
      return { balance, balanceFormatted };
    }
    
    return { balance: '0', balanceFormatted: 0 };
  } catch (error) {
    console.error(`Error fetching specific token balance:`, error);
    return null;
  }
}

// Transaction details function for extracting token contracts from multicalls
export async function getTransactionDetails(hash: string) {
  try {
    trackApiCall(null, 'getTransactionDetails');
    console.log(`Fetching transaction details for ${hash}`);
    
    const url = `${PULSECHAIN_SCAN_API_BASE}/transactions/${hash}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PulseChain Scan API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract token addresses from Transfer event logs
    const tokenAddresses = new Set<string>();
    if (data.logs) {
      data.logs.forEach((log: any) => {
        if (log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          tokenAddresses.add(log.address);
        }
      });
    }

    return {
      ...data,
      extractedTokens: Array.from(tokenAddresses)
    };
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    throw error;
  }
}

// Token info function for complete metadata extraction
export async function getTokenInfo(address: string) {
  try {
    trackApiCall(null, 'getTokenInfo');
    console.log(`Fetching token info for ${address}`);
    
    const url = `${PULSECHAIN_SCAN_API_BASE}/tokens/${address}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PulseChain Scan API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get price from DexScreener
    let priceData = null;
    try {
      priceData = await getTokenPriceFromDexScreener(address);
    } catch (e) {
      console.warn(`Failed to get price for ${address}`);
    }

    return {
      address: data.address || address,
      name: data.name || 'Unknown',
      symbol: data.symbol || 'Unknown',
      decimals: data.decimals || '18',
      icon_url: data.icon_url || null,
      verified: data.verified || false,
      price: priceData?.usdPrice || null,
      priceChange24h: priceData?.usdPrice24hrPercentChange || null
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw error;
  }
}

// Legacy compatibility - map getWalletData to getWalletDataFull
export const getWalletData = getWalletDataFull;