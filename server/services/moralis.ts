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
 * Get complete token information including metadata, logo, and price
 */
export const getTokenFullMetadata = async (tokenAddress: string): Promise<{
  address: string;
  name: string;
  symbol: string;
  decimals: string;
  logo?: string;
  price?: number;
  priceChange24h?: number;
  verified?: boolean;
} | null> => {
  try {
    // First try to get metadata including logo
    const metadataResponse = await Moralis.EvmApi.token.getTokenMetadata({
      chain: PULSECHAIN_CHAIN_ID,
      addresses: [tokenAddress]
    });
    
    if (!metadataResponse || !metadataResponse.raw || !metadataResponse.raw[0]) {
      return null;
    }
    
    const tokenData = metadataResponse.raw[0];
    
    // Then try to get price information
    let priceInfo: MoralisTokenPriceResponse | null = null;
    try {
      priceInfo = await getTokenPrice(tokenAddress);
    } catch (e) {
      console.log(`Couldn't get price info for ${tokenAddress}: ${e}`);
    }
    
    // Build the combined token data
    return {
      address: tokenAddress,
      name: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'UNK',
      decimals: tokenData.decimals?.toString() || '18',
      logo: tokenData.logo || undefined,
      price: priceInfo?.usdPrice,
      priceChange24h: priceInfo?.usdPrice24hrPercentChange,
      verified: tokenData.verified_contract || false
    };
  } catch (error) {
    console.error(`Error getting token metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
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
 * Get transaction details for a specific transaction hash
 * 
 * @param transactionHash The transaction hash to fetch details for
 * @returns Detailed transaction information
 */
export const getTransactionByHash = async (transactionHash: string) => {
  try {
    console.log(`Fetching detailed transaction data for hash: ${transactionHash}`);
    
    // Use the transaction verbose API for details
    const response = await Moralis.EvmApi.transaction.getTransactionVerbose({
      chain: PULSECHAIN_CHAIN_ID,
      transactionHash
    });
    
    if (!response || !response.toJSON()) {
      throw new Error('Invalid response from Moralis getTransactionVerbose');
    }
    
    // Use any type to allow adding custom properties
    const txData: any = response.toJSON();
    
    // Process the transaction data similar to how we do in getTransactionHistory
    if (txData) {
      // Initialize empty arrays for transfers if they don't exist
      if (!txData.erc20_transfers) {
        txData.erc20_transfers = [];
      }
      
      if (!txData.native_transfers) {
        txData.native_transfers = [];
      }
      
      // Process logs to extract additional information
      if (txData.logs && txData.logs.length > 0) {
        txData.logs.forEach((log: any) => {
          // Look for ERC20 Transfer events
          if (log.topic0 === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && 
              log.decoded_event && 
              log.decoded_event.label === 'Transfer') {
                
            // Extract transfer details from the decoded event
            const params = log.decoded_event.params;
            if (params && params.length >= 3) {
              const fromParam = params.find((p: any) => p.name === 'from');
              const toParam = params.find((p: any) => p.name === 'to');
              const valueParam = params.find((p: any) => p.name === 'value');
              
              if (fromParam && toParam && valueParam) {
                // Create ERC20 transfer object
                const transfer = {
                  token_address: log.address,
                  token_symbol: '', // Will be populated later if available
                  token_name: '',
                  token_decimals: '18', // Default decimals
                  from_address: fromParam.value,
                  to_address: toParam.value,
                  value: valueParam.value,
                  value_formatted: '', // Will calculate later if decimals are known
                  log_index: log.log_index,
                  transaction_hash: log.transaction_hash,
                };
                
                // Add to ERC20 transfers
                txData.erc20_transfers.push(transfer);
                
                // Fetch token metadata and enrich the transfer
                try {
                  getTokenFullMetadata(log.address).then(tokenData => {
                    if (tokenData) {
                      // Find the transfer we just added and update it with metadata
                      const transferIndex = txData.erc20_transfers.findIndex((t: any) => 
                        t.token_address === log.address && 
                        t.log_index === log.log_index
                      );
                      
                      if (transferIndex >= 0) {
                        const transferToUpdate = txData.erc20_transfers[transferIndex];
                        transferToUpdate.token_name = tokenData.name;
                        transferToUpdate.token_symbol = tokenData.symbol;
                        transferToUpdate.token_decimals = tokenData.decimals;
                        transferToUpdate.token_logo = tokenData.logo;
                        transferToUpdate.usd_price = tokenData.price;
                        
                        // Calculate formatted value and USD value if possible
                        if (tokenData.decimals && transferToUpdate.value) {
                          const valueNum = parseInt(transferToUpdate.value);
                          const decimals = parseInt(tokenData.decimals);
                          if (!isNaN(valueNum) && !isNaN(decimals)) {
                            const valueFormatted = valueNum / Math.pow(10, decimals);
                            transferToUpdate.value_formatted = valueFormatted.toString();
                            
                            // Add USD value if price is available
                            if (tokenData.price) {
                              transferToUpdate.usd_value = valueFormatted * tokenData.price;
                            }
                          }
                        }
                      }
                    }
                  }).catch(e => {
                    console.error(`Error enriching token data for ${log.address}:`, e);
                  });
                } catch (e) {
                  console.error(`Failed to process token metadata for ${log.address}:`, e);
                }
              }
            }
          }
          
          // Look for Swap events
          if (log.decoded_event && log.decoded_event.label === 'Swap') {
            // Mark this transaction as a DEX swap
            txData.category = 'swap';
          }
        });
      }
      
      // Add native transfer if value is non-zero
      if (txData.value && txData.value !== '0') {
        const nativeTransfer = {
          from_address: txData.from_address,
          to_address: txData.to_address,
          value: txData.value,
          value_formatted: (parseInt(txData.value) / 1e18).toString(), // Format as PLS
          token_symbol: 'PLS',
          token_name: 'PulseChain',
          token_decimals: '18',
        };
        
        txData.native_transfers.push(nativeTransfer);
      }
      
      // Add transaction method from decoded call if available
      if (txData.decoded_call && txData.decoded_call.label && !txData.method_label) {
        txData.method_label = txData.decoded_call.label;
      }
      
      // Determine transaction category based on transfers if not already set
      if (!txData.category) {
        const hasErc20Transfers = txData.erc20_transfers && txData.erc20_transfers.length > 0;
        const hasNativeTransfers = txData.native_transfers && txData.native_transfers.length > 0;
        
        if (hasErc20Transfers && hasNativeTransfers) {
          txData.category = 'swap';
        } else if (hasNativeTransfers) {
          txData.category = 'transfer';
        } else if (hasErc20Transfers) {
          txData.category = 'token';
        } else if (txData.method_label && txData.method_label.toLowerCase().includes('approve')) {
          txData.category = 'approval';
        } else {
          txData.category = 'contract';
        }
      }
    }
    
    return txData;
  } catch (error) {
    console.error(`Error fetching transaction ${transactionHash}:`, error);
    return null;
  }
};

/**
 * Get transaction history for a wallet address from Moralis verbose endpoint
 * This provides much richer data than the standard transaction endpoint
 * 
 * @param walletAddress Wallet address to fetch transaction history for
 * @param limit Maximum number of transactions to return (max 25 for verbose endpoint)
 * @param cursor Pagination cursor for fetching next page
 * @returns Transaction history with rich transaction data
 */
export const getTransactionHistory = async (
  walletAddress: string,
  limit: number = 25,
  cursor: string | null = null
) => {
  try {
    console.log(`Fetching transaction history for ${walletAddress} from Moralis SDK (wallet history endpoint)`);
    
    // Normalize wallet address to lowercase for comparison
    const normalizedWalletAddress = walletAddress.toLowerCase();
    
    // Create options object for Moralis API call
    const options: any = {
      chain: 'pulse', // Using the chain name directly instead of hex chain ID
      address: normalizedWalletAddress,
      order: 'DESC',
      limit: Math.min(limit, 100), // Allow up to 100 transactions per request
    };
    
    if (cursor) {
      options.cursor = cursor;
    }
    
    console.log('Calling Moralis wallets.getWalletHistory with options:', JSON.stringify(options));
    
    // Use the wallets.getWalletHistory endpoint which provides rich transaction details
    const response = await Moralis.EvmApi.wallets.getWalletHistory(options);
    console.log('Transaction API response received');
    
    if (!response || !response.raw) {
      throw new Error('Empty response from Moralis wallets.getWalletHistory');
    }
    
    // Get the raw response data
    const data = response.raw as any;
    
    // Debug response info
    console.log(`Got transaction response with ${data.result?.length || 0} transactions`);
    console.log('Transaction response keys:', Object.keys(data));
    
    if (data.result && data.result.length > 0) {
      console.log(`Successfully fetched ${data.result.length} transactions for ${walletAddress}`);
      
      // Log sample transaction (first one)
      const sampleTx = data.result[0];
      console.log('First transaction summary:', sampleTx.summary || 'No summary available');
      console.log('Transaction type:', sampleTx.category || 'unknown');
      
      // Log first transaction's ERC20 transfers count
      if (sampleTx.erc20_transfers && sampleTx.erc20_transfers.length > 0) {
        console.log(`First transaction has ${sampleTx.erc20_transfers.length} ERC20 transfers`);
        
        // Log the first transfer as sample
        const sampleTransfer = sampleTx.erc20_transfers[0];
        console.log('Sample transfer:', JSON.stringify({
          token: sampleTransfer.token_symbol,
          from: sampleTransfer.from_address,
          to: sampleTransfer.to_address,
          value: sampleTransfer.value_formatted,
          direction: sampleTransfer.direction || 'unknown'
        }));
      }
    } else {
      console.log('No transactions found for this wallet address');
    }
    
    // Process the transactions to ensure all transfers have direction
    const result = data.result ? data.result.map((tx: any) => {
      // Ensure transfer arrays exist
      if (!tx.erc20_transfers) {
        tx.erc20_transfers = [];
      }
      
      if (!tx.native_transfers) {
        tx.native_transfers = [];
      }
      
      // Process ERC20 transfers to set direction property if not already set
      if (tx.erc20_transfers.length > 0) {
        tx.erc20_transfers = tx.erc20_transfers.map((transfer: any) => {
          // If direction is already set, keep it
          if (transfer.direction) {
            return transfer;
          }
          
          // Otherwise, determine direction based on wallet address
          const isReceiving = transfer.to_address?.toLowerCase() === normalizedWalletAddress;
          const isSending = transfer.from_address?.toLowerCase() === normalizedWalletAddress;
          
          return {
            ...transfer,
            direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown'),
            // Ensure token_address is set (sometimes it's in address property)
            token_address: transfer.token_address || transfer.address
          };
        });
      }
      
      // Add additional token swap indicators if not already categorized
      if (!tx.category && tx.erc20_transfers && tx.erc20_transfers.length >= 2) {
        const sentTokens = tx.erc20_transfers.filter((t: any) => 
          t.direction === 'send' || t.from_address?.toLowerCase() === normalizedWalletAddress
        );
        
        const receivedTokens = tx.erc20_transfers.filter((t: any) => 
          t.direction === 'receive' || t.to_address?.toLowerCase() === normalizedWalletAddress
        );
        
        if (sentTokens.length > 0 && receivedTokens.length > 0) {
          tx.category = 'token swap';
          
          // Create a summary if one doesn't exist
          if (!tx.summary) {
            const sentToken = sentTokens[0];
            const receivedToken = receivedTokens[0];
            
            if (sentToken && receivedToken) {
              // Format values with commas for thousands
              const sentAmount = parseFloat(sentToken.value_formatted).toLocaleString(undefined, {
                maximumFractionDigits: 2
              });
              const receivedAmount = parseFloat(receivedToken.value_formatted).toLocaleString(undefined, {
                maximumFractionDigits: 2
              });
              
              tx.summary = `Swapped ${sentAmount} ${sentToken.token_symbol} for ${receivedAmount} ${receivedToken.token_symbol}`;
            }
          }
        }
      }
      
      return tx;
    }) : [];
    
    // Return processed data
    return {
      result,
      cursor: data.cursor || null,
      page: data.page || 0,
      page_size: data.page_size || limit,
      total: data.total || result.length
    };
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

// Removing duplicate getTokenMetadata function

