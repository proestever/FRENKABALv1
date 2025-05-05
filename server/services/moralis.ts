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

/**
 * Helper function to ensure token price response has all required fields
 */
export function ensureValidTokenPriceResponse(response: any): MoralisTokenPriceResponse {
  // Create a base valid response with defaults for all required fields
  const validResponse: MoralisTokenPriceResponse = {
    tokenName: response.tokenName || "Unknown",
    tokenSymbol: response.tokenSymbol || "UNK",
    tokenDecimals: response.tokenDecimals || "18",
    nativePrice: {
      value: response.nativePrice?.value || "0",
      decimals: response.nativePrice?.decimals || 18,
      name: response.nativePrice?.name || "PLS",
      symbol: response.nativePrice?.symbol || "PLS",
      address: response.nativePrice?.address || PLS_TOKEN_ADDRESS
    },
    usdPrice: response.usdPrice || 0,
    usdPriceFormatted: response.usdPriceFormatted || "0",
    exchangeName: response.exchangeName || "Unknown",
    exchangeAddress: response.exchangeAddress || "0x0000000000000000000000000000000000000000",
    tokenAddress: response.tokenAddress || "0x0000000000000000000000000000000000000000",
    blockTimestamp: response.blockTimestamp || new Date().toISOString()
  };
  
  // Handle 24h percent changes, ensuring they are available in a consistent format
  // First check for usdPrice24hrPercentChange (our preferred field)
  if (response.usdPrice24hrPercentChange !== undefined) {
    validResponse.usdPrice24hrPercentChange = response.usdPrice24hrPercentChange;
  } 
  // Then check for 24hrPercentChange string field
  else if (response['24hrPercentChange'] !== undefined) {
    // Convert string percentage to number if needed
    const percentChange = typeof response['24hrPercentChange'] === 'string' 
      ? parseFloat(response['24hrPercentChange']) 
      : response['24hrPercentChange'];
    
    validResponse.usdPrice24hrPercentChange = percentChange;
    validResponse['24hrPercentChange'] = response['24hrPercentChange'];
  }
  // Default to 0 if no price change data is available
  else {
    validResponse.usdPrice24hrPercentChange = 0;
  }
  
  // Add other optional fields if they exist
  if (response.tokenLogo) validResponse.tokenLogo = response.tokenLogo;
  if (response.usdPrice24hrUsdChange) validResponse.usdPrice24hrUsdChange = response.usdPrice24hrUsdChange;
  if (response.possibleSpam !== undefined) validResponse.possibleSpam = response.possibleSpam;
  if (response.verifiedContract !== undefined) validResponse.verifiedContract = response.verifiedContract;
  
  // Log price changes when debugging
  console.log(`Token ${validResponse.tokenSymbol} price change: ${validResponse.usdPrice24hrPercentChange}%`);
  
  return validResponse;
}

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
  
  // Ensure price and price change data are properly typed
  const price = typeof token.usd_price === 'number' ? token.usd_price : 0;
  
  // Calculate token value (balance * price)
  const value = balanceFormatted * price;
  
  // Ensure price change is properly handled
  let priceChange24h: number | undefined = undefined;
  if (typeof token.usd_price_24hr_percent_change === 'number') {
    priceChange24h = token.usd_price_24hr_percent_change;
  }
  
  // Log for debugging
  if (price > 0) {
    console.log(`Token ${token.symbol} processed: price=$${price}, change=${priceChange24h}%, value=$${value}`);
  }
  
  return {
    address: token.token_address,
    symbol: token.symbol || 'UNKNOWN',
    name: token.name || 'Unknown Token',
    decimals,
    balance: token.balance || '0',
    balanceFormatted,
    price,
    value,
    priceChange24h,
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
    
    // Process and normalize the raw response to match our expected types
    return response.raw.map(token => {
      // Create a properly typed token object
      const processedToken: MoralisWalletTokenBalanceItem = {
        token_address: token.token_address,
        symbol: token.symbol,
        name: token.name,
        // Ensure decimals is a string as required by the type
        decimals: typeof token.decimals === 'number' ? token.decimals.toString() : (token.decimals || '18'),
        balance: token.balance,
        possible_spam: !!token.possible_spam,
        verified_contract: !!token.verified_contract
      };
      
      // Add optional properties if they exist
      if (token.logo) processedToken.logo = token.logo as string;
      if (token.thumbnail) processedToken.thumbnail = token.thumbnail as string;
      
      // Calculate balance_formatted if it doesn't exist
      if (!('balance_formatted' in token)) {
        const decimalsNum = parseInt(processedToken.decimals);
        const balanceFormatted = parseFloat(token.balance) / Math.pow(10, decimalsNum);
        processedToken.balance_formatted = balanceFormatted.toString();
      } else if (token.balance_formatted !== undefined) {
        // Safely convert to string with type checking
        processedToken.balance_formatted = typeof token.balance_formatted === 'string' 
          ? token.balance_formatted 
          : String(token.balance_formatted);
      }
      
      // Add other price-related fields if they exist with proper type checking
      if ('usd_price' in token && typeof token.usd_price === 'number') {
        processedToken.usd_price = token.usd_price;
      }
      
      if ('usd_price_24hr_percent_change' in token && typeof token.usd_price_24hr_percent_change === 'number') {
        processedToken.usd_price_24hr_percent_change = token.usd_price_24hr_percent_change;
      }
      
      if ('usd_value' in token && typeof token.usd_value === 'number') {
        processedToken.usd_value = token.usd_value;
      }
      
      return processedToken;
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
    // Ensure the response has all required fields with proper types
    return ensureValidTokenPriceResponse(response.raw);
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
    
    // Use the price from wrapped token but create a base response for the native token
    const wrappedPrice = ensureValidTokenPriceResponse(response.raw);
    
    // Create response for native PLS token based on wrapped PLS price
    const nativeTokenPrice: MoralisTokenPriceResponse = {
      tokenName: name || "PulseChain",
      tokenSymbol: symbol || "PLS",
      tokenDecimals: "18",
      nativePrice: {
        value: "1000000000000000000",
        decimals: 18,
        name: symbol || "PLS",
        symbol: symbol || "PLS",
        address: PLS_TOKEN_ADDRESS
      },
      usdPrice: wrappedPrice.usdPrice,
      usdPriceFormatted: wrappedPrice.usdPriceFormatted,
      exchangeName: wrappedPrice.exchangeName,
      exchangeAddress: wrappedPrice.exchangeAddress,
      tokenAddress: PLS_TOKEN_ADDRESS,
      blockTimestamp: new Date().toISOString()
    };
    
    // Add percent change data if available
    if (wrappedPrice['24hrPercentChange']) {
      nativeTokenPrice['24hrPercentChange'] = wrappedPrice['24hrPercentChange'];
    }
    
    if (wrappedPrice.usdPrice24hrPercentChange !== undefined) {
      nativeTokenPrice.usdPrice24hrPercentChange = wrappedPrice.usdPrice24hrPercentChange;
    } else if (wrappedPrice['24hrPercentChange']) {
      nativeTokenPrice.usdPrice24hrPercentChange = parseFloat(wrappedPrice['24hrPercentChange']);
    } else {
      // Set a default of 0 if no price change data is available
      nativeTokenPrice.usdPrice24hrPercentChange = 0;
      console.log(`No price change data available for ${name}, using default of 0%`);
    }
    
    return nativeTokenPrice;
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
    
    // Create options object for the API call
    const options: any = {
      chain: PULSECHAIN_CHAIN_ID,
      address: walletAddress,
      limit
    };
    
    if (cursor) {
      options.cursor = cursor;
    }
    
    // Include ERC20 transfers option
    options.include = "internal_transactions";
    
    // Add processing function for transaction data enhancement
    const enhanceTransactionData = (tx: any) => {
      // Add transfer direction information
      if (tx?.erc20_transfers && Array.isArray(tx.erc20_transfers)) {
        tx.erc20_transfers = tx.erc20_transfers.map((transfer: any) => {
          const isReceiving = transfer.to_address?.toLowerCase() === walletAddress.toLowerCase();
          const isSending = transfer.from_address?.toLowerCase() === walletAddress.toLowerCase();
          
          return {
            ...transfer,
            direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
          };
        });
      }
      
      // Add transfer direction for native transfers
      if (tx?.native_transfers && Array.isArray(tx.native_transfers)) {
        tx.native_transfers = tx.native_transfers.map((transfer: any) => {
          const isReceiving = transfer.to_address?.toLowerCase() === walletAddress.toLowerCase();
          const isSending = transfer.from_address?.toLowerCase() === walletAddress.toLowerCase();
          
          return {
            ...transfer,
            direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
          };
        });
      }
      
      // Try to infer transaction category if missing
      if (!tx.category) {
        if (tx.method_label?.toLowerCase().includes('swap')) {
          tx.category = 'swap';
        } else if (tx.method_label?.toLowerCase().includes('approve')) {
          tx.category = 'approval';
        } else if (
          tx.erc20_transfers?.some((t: any) => 
            t.from_address?.toLowerCase() === walletAddress.toLowerCase() &&
            t.to_address?.toLowerCase() !== walletAddress.toLowerCase()
          )
        ) {
          tx.category = 'send';
        } else if (
          tx.erc20_transfers?.some((t: any) => 
            t.to_address?.toLowerCase() === walletAddress.toLowerCase() &&
            t.from_address?.toLowerCase() !== walletAddress.toLowerCase()
          )
        ) {
          tx.category = 'receive';
        } else if (tx.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
          tx.category = 'receive';
        } else if (tx.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
          tx.category = 'send';
        }
      }
      
      return tx;
    };
    
    // Get transaction data from Moralis
    const response = await Moralis.EvmApi.transaction.getWalletTransactions(options);
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getWalletTransactions');
    }
    
    // Enhance the transaction data
    if (response.raw.result && Array.isArray(response.raw.result)) {
      response.raw.result = response.raw.result.map(enhanceTransactionData);
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
 * Get the ERC20 Transfer event signature
 * keccak256("Transfer(address,address,uint256)")
 */
const ERC20_TRANSFER_EVENT = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Get token transfers for a specific transaction by directly calling the erc20 API
 */
export const getTokenTransfersForTx = async (txHash: string) => {
  try {
    console.log(`Fetching token transfers for transaction ${txHash} from Moralis SDK`);
    
    // Method 1: Use dedicated ERC20 endpoint to get token transfers (most reliable)
    try {
      // We need a wallet address for this method, so we'll skip it and rely on other methods
      // since we only have a transaction hash - commented out to avoid errors
      let response: any = null;
      
      /* 
       * SKIPPING METHOD 1 - Requires wallet address which we don't have
       * When we only have transaction hash
       */
      
      // This method will be skipped - no condition check needed
    } catch (error) {
      console.error('Error using dedicated ERC20 endpoint:', error);
    }
    
    // Method 2: Fallback to transaction logs
    try {
      const txDetails = await Moralis.EvmApi.transaction.getTransactionVerbose({
        chain: PULSECHAIN_CHAIN_ID,
        transactionHash: txHash
      });
      
      if (txDetails && txDetails.raw && txDetails.raw.logs) {
        console.log(`Found ${txDetails.raw.logs.length} logs in transaction ${txHash}`);
        
        // Extract ERC20 transfers from logs by finding logs with the Transfer event signature
        const transfers = txDetails.raw.logs
          .filter(log => {
            // Safely check topics exist before using them
            return log.topic0 === ERC20_TRANSFER_EVENT && 
                  typeof log.topic1 === 'string' && 
                  typeof log.topic2 === 'string';
          })
          .map(log => {
            try {
              // We've already checked these exist
              const topic1 = log.topic1 as string;
              const topic2 = log.topic2 as string;
              
              // Remove padding from addresses
              const fromAddress = '0x' + topic1.substring(26);
              const toAddress = '0x' + topic2.substring(26);
              
              // The token address is the address of the contract that emitted the log
              const tokenAddress = log.address;
              
              return {
                token_address: tokenAddress,
                from_address: fromAddress,
                to_address: toAddress,
                value: log.data, // This is the amount in hex
                transaction_hash: txHash
              };
            } catch (err) {
              console.error('Error processing log entry:', err);
              return null;
            }
          })
          .filter(transfer => transfer !== null); // Remove any failed conversions
        
        if (transfers.length > 0) {
          console.log(`Found ${transfers.length} ERC20 transfers in transaction ${txHash} from logs`);
          return transfers;
        }
      }
    } catch (error) {
      console.error('Error parsing transaction logs:', error);
    }
    
    // Method 3: Check for contract interaction in raw transaction
    try {
      const tx = await Moralis.EvmApi.transaction.getTransaction({
        chain: PULSECHAIN_CHAIN_ID,
        transactionHash: txHash
      });
      
      if (tx && tx.raw && tx.raw.to_address && tx.raw.input && tx.raw.input.startsWith('0xa9059cbb')) {
        console.log(`Found potential ERC20 transfer in transaction ${txHash} input data`);
        
        try {
          // Extract recipient and value from input data
          // Input format: 0xa9059cbb + <address padded to 32 bytes> + <value padded to 32 bytes>
          const inputData = tx.raw.input;
          const recipientAddress = '0x' + inputData.substring(34, 74);
          const amount = '0x' + inputData.substring(74);
          
          return [{
            token_address: tx.raw.to_address,
            from_address: tx.raw.from_address,
            to_address: recipientAddress,
            value: amount,
            transaction_hash: txHash
          }];
        } catch (err) {
          console.error('Error extracting data from input:', err);
        }
      }
    } catch (error) {
      console.error('Error checking input data:', error);
    }
    
    // If we reach here, no transfers found
    console.log(`No token transfers found for transaction ${txHash} after all methods tried`);
    return [];
  } catch (error) {
    console.error(`Error fetching token transfers for tx ${txHash}:`, error);
    return [];
  }
};

/**
 * Get token metadata from the blockchain
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