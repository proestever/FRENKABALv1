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

import { apiStatsService } from './api-stats-service';
import { getTokenPriceFromDexScreener, getTokenPriceDataFromDexScreener, getWalletBalancesFromPulseChainScan, getDexScreenerTokenData, getTokenLogoFromDexScreener } from './dexscreener';

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
    // Collect unique token addresses from all transactions for batch fetching
    const tokenAddressesSet = new Set<string>();
    transactions_data.forEach((tx: any) => {
      if (tx.token_transfers) {
        tx.token_transfers.forEach((transfer: any) => {
          if (transfer.token?.address) {
            tokenAddressesSet.add(transfer.token.address.toLowerCase());
          }
        });
      }
    });
    
    // Batch fetch token logos from DexScreener for all unique tokens
    const tokenLogos: Record<string, string> = {};
    const tokenAddresses = Array.from(tokenAddressesSet);
    
    if (tokenAddresses.length > 0) {
      console.log(`Fetching DexScreener data for ${tokenAddresses.length} unique tokens`);
      
      // Process in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < tokenAddresses.length; i += batchSize) {
        const batch = tokenAddresses.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (address) => {
            try {
              const dexData = await getDexScreenerTokenData(address);
              if (dexData && dexData.pairs && dexData.pairs.length > 0) {
                const pair = dexData.pairs[0];
                const tokenInfo = pair.baseToken.address.toLowerCase() === address 
                  ? pair.baseToken 
                  : pair.quoteToken;
                
                // Check for logo in info field first
                if (pair.info && pair.info.imageUrl) {
                  tokenLogos[address] = pair.info.imageUrl;
                } else if (tokenInfo.info?.imageUrl) {
                  tokenLogos[address] = tokenInfo.info.imageUrl;
                }
              }
            } catch (error) {
              // Silently ignore errors for individual tokens
              console.warn(`Failed to get DexScreener logo for ${address}`);
            }
          })
        );
      }
    }
    
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
      // Map token transfers with enhanced logos
      erc20_transfers: tx.token_transfers ? tx.token_transfers.map((transfer: any) => {
        const tokenAddress = transfer.token?.address?.toLowerCase() || '';
        const dexScreenerLogo = tokenLogos[tokenAddress];
        const fromAddress = transfer.from?.hash?.toLowerCase() || '';
        const toAddress = transfer.to?.hash?.toLowerCase() || '';
        const wallet = walletAddress.toLowerCase();
        
        return {
          token_name: transfer.token?.name || null,
          token_symbol: transfer.token?.symbol || null,
          token_logo: dexScreenerLogo || transfer.token?.icon_url || null,
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
          direction: fromAddress === wallet ? 'send' : (toAddress === wallet ? 'receive' : null),
          internal_transaction: false
        };
      }) : [],
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
  
  console.log(`Fetching fresh price for token: ${normalizedAddress}`);
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
    
    // Use the new scanner API for ultra-fast token fetching
    const { getScannerTokenBalances } = await import('./scanner-balance-service');
    console.log(`Using Scanner API for ultra-fast token fetching for ${walletAddress}`);

    // Silent loading - no progress updates

    const tokens = await getScannerTokenBalances(walletAddress);
    
    // Silent loading - no progress updates
    
    console.log(`Scanner data fetch completed for ${walletAddress} in ${Date.now() - startTime}ms`);
    console.log(`Tokens received:`, Array.isArray(tokens) ? `${tokens.length} tokens` : 'not an array');
    
    if (!tokens || !Array.isArray(tokens)) {
      throw new Error('Scanner returned invalid data');
    }
    
    // Calculate total value
    const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Get PLS balance and price change
    const plsToken = tokens.find(t => t.isNative);
    const plsBalance = plsToken?.balanceFormatted || null;
    const plsPriceChange = plsToken?.priceChange24h || null;
    
    // Apply pagination if needed
    const paginatedTokens = tokens.slice((page - 1) * limit, page * limit);
    
    return {
      address: walletAddress,
      tokens: paginatedTokens,
      totalValue,
      tokenCount: tokens.length,
      plsBalance,
      plsPriceChange,
      networkCount: 1,
      pagination: {
        page,
        limit,
        totalItems: tokens.length,
        totalPages: Math.ceil(tokens.length / limit)
      },
      backgroundFetchTriggered: false,
      missingPriceCount: 0,
      fetchMethod: 'scanner' // Add this to identify the method used
    };
  } catch (error) {
    console.error(`Error fetching wallet data for ${walletAddress}:`, error);
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
export async function getTransactionDetails(hash: string): Promise<any> {
  try {
    trackApiCall(null, 'getTransactionDetails');
    console.log(`Fetching transaction details for ${hash}`);
    
    const url = `${PULSECHAIN_SCAN_API_BASE}/transactions/${hash}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PulseChain Scan API error: ${response.status}`);
    }
    
    const data: any = await response.json();
    
    // Extract token addresses from Transfer event logs
    const tokenAddresses = new Set<string>();
    if (data.logs) {
      data.logs.forEach((log: any) => {
        if (log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          tokenAddresses.add(log.address);
        }
      });
    }

    // Fetch token metadata for extracted addresses
    const tokenMetadata = await Promise.all(
      Array.from(tokenAddresses).map(async (address) => {
        try {
          const tokenInfo = await getTokenInfo(address as string);
          return {
            address: tokenInfo.address,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            decimals: tokenInfo.decimals,
            logo: tokenInfo.icon_url,
            price: tokenInfo.price
          };
        } catch (error) {
          console.error(`Error fetching token metadata for ${address}:`, error);
          return {
            address,
            symbol: 'Unknown',
            name: 'Unknown Token',
            decimals: '18'
          };
        }
      })
    );

    return {
      ...data,
      extractedTokens: Array.from(tokenAddresses),
      tokenMetadata
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
    
    const data: any = await response.json();
    
    // Get price from DexScreener
    let price = null;
    try {
      price = await getTokenPriceFromDexScreener(address);
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
      price: price || null,
      priceChange24h: null
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw error;
  }
}

// Legacy compatibility - map getWalletData to getWalletDataFull
export const getWalletData = getWalletDataFull;