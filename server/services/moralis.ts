import Moralis from 'moralis';
import { 
  MoralisTokenPriceResponse,
  MoralisWalletTokenBalanceItem,
  ProcessedToken,
} from '../types';

// Constants for PulseChain
export const PULSECHAIN_CHAIN_ID = '0x171'; // PulseChain Mainnet
export const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

// Default logos for important tokens
const TOKEN_LOGOS: Record<string, string> = {
  [PLS_TOKEN_ADDRESS.toLowerCase()]: 'https://cryptologos.cc/logos/pulse-pls-logo.png',
  // Add other important token logos here
};

// Check if Moralis is already initialized
export const initMoralis = async (): Promise<void> => {
  // Only attempt to initialize if not already initialized
  // We'll assume it's already initialized in the main api.ts file
  // This prevents multiple initialization errors
  try {
    console.log('✅ Using already initialized Moralis SDK');
  } catch (error) {
    console.error('❌ Error accessing Moralis SDK:', error);
  }
};

/**
 * Process token data into a standardized format
 */
export const processTokenData = (token: MoralisWalletTokenBalanceItem, logoUrl?: string): ProcessedToken => {
  const isNative = token.token_address?.toLowerCase() === PLS_TOKEN_ADDRESS.toLowerCase();
  const decimals = parseInt(token.decimals || '18');
  const balanceFormatted = parseFloat(token.balance_formatted || '0');
  
  return {
    address: token.token_address,
    symbol: token.symbol || 'UNKNOWN',
    name: token.name || 'Unknown Token',
    decimals,
    balance: token.balance || '0',
    balanceFormatted,
    price: token.usd_price,
    value: token.usd_value,
    priceChange24h: token.usd_price_24hr_percent_change,
    logo: logoUrl || token.logo || getDefaultLogo(token.symbol),
    exchange: '', // Moralis doesn't always provide this
    verified: token.verified_contract === true,
    isNative
  };
};

/**
 * Get default logo URL for common tokens
 */
export const getDefaultLogo = (symbol: string | null | undefined): string => {
  if (!symbol) return '/assets/100xfrenlogo.png';
  
  // Lowercase for comparison
  const symbolLower = symbol.toLowerCase();
  
  // Common token logos
  switch (symbolLower) {
    case 'pls':
      return 'https://cryptologos.cc/logos/pulse-pls-logo.png';
    case 'wpls':
      return 'https://cryptologos.cc/logos/pulse-pls-logo.png';
    case 'hex':
      return 'https://cryptologos.cc/logos/hex-hex-logo.png';
    case 'plsx':
      return 'https://cryptologos.cc/logos/pulsex-plsx-logo.png';
    default:
      return '/assets/100xfrenlogo.png';
  }
};

/**
 * Get wallet token balances with SDK
 */
export const getWalletTokenBalances = async (walletAddress: string): Promise<MoralisWalletTokenBalanceItem[]> => {
  try {
    console.log(`Fetching token balances for ${walletAddress} from Moralis API`);
    
    const response = await Moralis.EvmApi.token.getWalletTokenBalances({
      chain: PULSECHAIN_CHAIN_ID,
      address: walletAddress,
    });
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getWalletTokenBalances');
    }
    
    // Add balance_formatted property to each token if it doesn't exist
    return response.raw.map(token => {
      if (!('balance_formatted' in token)) {
        const decimals = parseInt(token.decimals || '18');
        const balanceFormatted = parseFloat(token.balance) / Math.pow(10, decimals);
        return {
          ...token,
          balance_formatted: balanceFormatted.toString()
        };
      }
      return token;
    });
  } catch (error) {
    console.error(`Error fetching wallet balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};

/**
 * Get native balance with SDK
 */
export const getNativeBalance = async (walletAddress: string): Promise<{
  balance: string, 
  balanceFormatted: number
}> => {
  try {
    console.log(`Fetching native balance for ${walletAddress} from Moralis API`);
    
    const response = await Moralis.EvmApi.balance.getNativeBalance({
      chain: PULSECHAIN_CHAIN_ID,
      address: walletAddress,
    });
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getNativeBalance');
    }
    
    // Format balance with 18 decimals (standard for EVM chains)
    const balanceWei = response.raw.balance;
    const balanceFormatted = parseFloat(balanceWei) / 10**18;
    
    return {
      balance: balanceWei,
      balanceFormatted
    };
  } catch (error) {
    console.error(`Error fetching native balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};

/**
 * Get token price with SDK
 */
export const getTokenPrice = async (tokenAddress: string): Promise<MoralisTokenPriceResponse | null> => {
  // Special case for native PLS token
  if (tokenAddress.toLowerCase() === PLS_TOKEN_ADDRESS.toLowerCase()) {
    return getWrappedTokenPrice(WPLS_CONTRACT_ADDRESS, 'PLS', 'PulseChain');
  }
  
  try {
    console.log(`Fetching price for token ${tokenAddress} from Moralis SDK`);
    
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: PULSECHAIN_CHAIN_ID,
      include: "percent_change",
      address: tokenAddress
    });
    
    if (!response || !response.raw) {
      return null;
    }
    
    console.log(`Successfully fetched price for ${tokenAddress}: ${response.raw.usdPrice} USD`);
    return response.raw as MoralisTokenPriceResponse;
  } catch (error) {
    console.error(`Error fetching token price: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
};

/**
 * Get wrapped token price (used for native tokens)
 */
export const getWrappedTokenPrice = async (
  wrappedTokenAddress: string,
  symbol = 'PLS',
  name = 'PulseChain'
): Promise<MoralisTokenPriceResponse | null> => {
  try {
    console.log(`Fetching wrapped token price for ${wrappedTokenAddress}`);
    
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: PULSECHAIN_CHAIN_ID,
      include: "percent_change",
      address: wrappedTokenAddress
    });
    
    if (!response || !response.raw) {
      return null;
    }
    
    // Use the price from wrapped token but create response for native token
    const wrappedPrice = response.raw;
    
    return {
      tokenName: name || "PulseChain",
      tokenSymbol: symbol || "PLS",
      tokenDecimals: "18",
      nativePrice: {
        value: "1000000000000000000",
        decimals: 18,
        name: symbol,
        symbol: symbol,
        address: PLS_TOKEN_ADDRESS
      },
      usdPrice: wrappedPrice.usdPrice,
      usdPriceFormatted: wrappedPrice.usdPriceFormatted,
      exchangeName: wrappedPrice.exchangeName,
      exchangeAddress: wrappedPrice.exchangeAddress,
      tokenAddress: PLS_TOKEN_ADDRESS,
      blockTimestamp: new Date().toISOString(),
      '24hrPercentChange': wrappedPrice['24hrPercentChange'],
      usdPrice24hrPercentChange: wrappedPrice.usdPrice24hrPercentChange
    };
  } catch (error) {
    console.error(`Error fetching wrapped token price: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
};

/**
 * Get transaction history with SDK
 */
export const getTransactionHistory = async (
  walletAddress: string,
  limit: number = 100,
  cursor: string | null = null
) => {
  try {
    console.log(`Fetching transaction history for ${walletAddress} from Moralis SDK`);
    
    const options: any = {
      chain: PULSECHAIN_CHAIN_ID,
      address: walletAddress,
      limit
    };
    
    if (cursor) {
      options.cursor = cursor;
    }
    
    const response = await Moralis.EvmApi.transaction.getWalletTransactions(options);
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getWalletTransactions');
    }
    
    return response.raw;
  } catch (error) {
    console.error(`Error fetching transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};

/**
 * Batch get token prices for multiple tokens
 */
export const batchGetTokenPrices = async (tokenAddresses: string[]): Promise<Record<string, MoralisTokenPriceResponse>> => {
  if (!tokenAddresses.length) return {};
  
  console.log(`Batch fetching prices for ${tokenAddresses.length} tokens`);
  
  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;
  const results: Record<string, MoralisTokenPriceResponse> = {};
  
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    const batchPromises = batch.map(address => getTokenPrice(address));
    
    // Wait for all promises in this batch
    const batchResults = await Promise.all(batchPromises);
    
    // Add successful results to the map
    batch.forEach((address, index) => {
      const price = batchResults[index];
      if (price) {
        results[address.toLowerCase()] = price;
      }
    });
    
    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < tokenAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

/**
 * Get token metadata with SDK
 */
export const getTokenMetadata = async (tokenAddress: string) => {
  try {
    console.log(`Fetching token metadata for ${tokenAddress}`);
    
    const response = await Moralis.EvmApi.token.getTokenMetadata({
      chain: PULSECHAIN_CHAIN_ID,
      addresses: [tokenAddress]
    });
    
    if (!response || !response.raw || !response.raw.length) {
      throw new Error('Invalid response from Moralis getTokenMetadata');
    }
    
    return response.raw[0];
  } catch (error) {
    console.error(`Error fetching token metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
};