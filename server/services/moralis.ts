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
    
    // Make the API request for the specific transaction
    const response = await Moralis.EvmApi.transaction.getTransactionVerbose({
      chain: PULSECHAIN_CHAIN_ID,
      transactionHash
    });
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getTransactionVerbose');
    }
    
    // Use any type to allow adding custom properties
    const txData: any = response.raw;
    
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
    console.log(`Fetching transaction history for ${walletAddress} from Moralis SDK (verbose endpoint)`);
    
    // Normalize wallet address to lowercase for comparison
    const normalizedWalletAddress = walletAddress.toLowerCase();
    
    // Make the API request using the verbose endpoint
    const options: any = {
      chain: PULSECHAIN_CHAIN_ID,
      address: normalizedWalletAddress,
      limit: Math.min(limit, 25), // Limit to 25 for verbose endpoint
    };
    
    if (cursor) {
      options.cursor = cursor;
    }
    
    // Use the verbose endpoint for richer transaction data
    const response = await Moralis.EvmApi.transaction.getWalletTransactionsVerbose(options);
    
    if (!response || !response.raw) {
      throw new Error('Invalid response from Moralis getWalletTransactionsVerbose');
    }
    
    const responseData = response.raw;
    
    // Process transaction data and extract transfer information from logs
    const result = responseData.result ? responseData.result.map((tx: any) => {
      // Initialize empty arrays for transfers if they don't exist
      if (!tx.erc20_transfers) {
        tx.erc20_transfers = [];
      }
      
      if (!tx.native_transfers) {
        tx.native_transfers = [];
      }
      
      // Check if we have logs to process
      if (tx.logs && tx.logs.length > 0) {
        // Process logs to extract ERC20 transfers
        tx.logs.forEach((log: any) => {
          // Look for ERC20 Transfer events (topic0 = Transfer event signature)
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
                
                // Set direction based on from/to addresses
                const isReceiving = toParam.value.toLowerCase() === normalizedWalletAddress;
                const isSending = fromParam.value.toLowerCase() === normalizedWalletAddress;
                
                // Only add transfers that involve the wallet address
                if (isReceiving || isSending) {
                  tx.erc20_transfers.push({
                    ...transfer,
                    direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
                  });
                }
              }
            }
          }
          
          // Look for Swap events to enrich transaction data
          if (log.decoded_event && log.decoded_event.label === 'Swap') {
            // Mark this transaction as a DEX swap by setting a category
            tx.category = 'swap';
            
            // Enrich with method label if not set
            if (!tx.method_label) {
              tx.method_label = 'Swap';
            }
            
            // Could add more swap details here if needed
          }
        });
      }
      
      // Add native transfer if value is non-zero
      if (tx.value && tx.value !== '0') {
        const nativeTransfer = {
          from_address: tx.from_address,
          to_address: tx.to_address,
          value: tx.value,
          value_formatted: (parseInt(tx.value) / 1e18).toString(), // Format as PLS
          token_symbol: 'PLS',
          token_name: 'PulseChain',
          token_decimals: '18',
        };
        
        // Set direction for native transfer
        const isReceiving = tx.to_address.toLowerCase() === normalizedWalletAddress;
        const isSending = tx.from_address.toLowerCase() === normalizedWalletAddress;
        
        if (isReceiving || isSending) {
          tx.native_transfers.push({
            ...nativeTransfer,
            direction: isReceiving ? 'receive' : (isSending ? 'send' : 'unknown')
          });
        }
      }
      
      // Add transaction method from decoded call if available
      if (tx.decoded_call && tx.decoded_call.label && !tx.method_label) {
        tx.method_label = tx.decoded_call.label;
      }
      
      // Determine transaction category based on transfers if not already set
      if (!tx.category) {
        const hasOutgoingErc20 = tx.erc20_transfers.some((t: any) => t.direction === 'send');
        const hasIncomingErc20 = tx.erc20_transfers.some((t: any) => t.direction === 'receive');
        const hasOutgoingNative = tx.native_transfers.some((t: any) => t.direction === 'send');
        const hasIncomingNative = tx.native_transfers.some((t: any) => t.direction === 'receive');
        
        if (hasOutgoingErc20 && hasIncomingErc20) {
          tx.category = 'swap';
        } else if (hasOutgoingErc20 || hasOutgoingNative) {
          tx.category = 'send';
        } else if (hasIncomingErc20 || hasIncomingNative) {
          tx.category = 'receive';
        } else if (tx.method_label && tx.method_label.toLowerCase().includes('approve')) {
          tx.category = 'approval';
        } else {
          tx.category = 'contract';
        }
      }
      
      return tx;
    }) : [];
    
    console.log(`Successfully fetched transaction history for ${walletAddress} - ${result.length} transactions`);
    
    // Log a sample of the first transaction (truncated to avoid huge logs)
    if (result.length > 0) {
      const sampleTx = { ...result[0] };
      // Truncate large arrays to avoid excessive logging
      if (sampleTx.erc20_transfers && sampleTx.erc20_transfers.length > 2) {
        sampleTx.erc20_transfers = sampleTx.erc20_transfers.slice(0, 2);
        sampleTx.erc20_transfers.push({ note: `...and ${result[0].erc20_transfers.length - 2} more transfers` });
      }
      console.log('First transaction sample:', JSON.stringify(sampleTx).substring(0, 300) + '...');
    } else {
      console.log('No transactions found');
    }
    
    // Return processed data
    return {
      result,
      cursor: responseData.cursor || null,
      page: responseData.page || 0,
      page_size: responseData.page_size || limit,
      total: responseData.total || result.length
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

