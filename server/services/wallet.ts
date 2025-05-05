import { 
  ProcessedToken, 
  WalletData, 
  Transaction
} from '../types';
import { InsertTokenLogo } from '@shared/schema';
import { storage } from '../storage';
import { updateLoadingProgress } from '../routes';
import * as moralisService from './moralis';
import * as transactionAnalyzer from './transaction-analyzer';
import Moralis from 'moralis';

/**
 * Get full wallet data including token balances and prices
 * @param walletAddress The wallet address to fetch data for
 * @param page Page number for pagination (1-based)
 * @param limit Number of tokens per page
 */
export async function getWalletData(
  walletAddress: string, 
  page: number = 1, 
  limit: number = 100
): Promise<WalletData> {
  try {
    // Normalize the wallet address to lowercase
    walletAddress = walletAddress.toLowerCase();
    
    // Initialize response structure
    const response: WalletData = {
      address: walletAddress,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: null,
      plsPriceChange: null,
      networkCount: 0,
    };
    
    // Update loading progress
    updateLoadingProgress({
      status: 'loading',
      currentBatch: 1,
      totalBatches: 9, // We'll break this into 9 distinct steps
      message: 'Fetching wallet balances...'
    });
    
    // Step 1: Get wallet token balances from Moralis
    let tokenBalances: ProcessedToken[] = [];
    try {
      const moralisTokens = await moralisService.getWalletTokenBalances(walletAddress);
      
      // Check for any missing tokens that we know the user has (in case the API didn't return them)
      // This is a workaround for tokens that might not be indexed correctly in the Moralis API
      const knownTokenAddresses = [
        "0xec4252e62C6dE3D655cA9Ce3AfC12E553ebBA274" // Token reported missing by the user
      ];
      
      // Check if any of these tokens are missing from the moralisTokens result
      for (const knownAddress of knownTokenAddresses) {
        // Skip if token already exists in the results
        if (moralisTokens.some(token => token.token_address.toLowerCase() === knownAddress.toLowerCase())) {
          console.log(`Token ${knownAddress} is already in the results`);
          continue;
        }
        
        console.log(`Fetching specific token balance for ${knownAddress}`);
        // Try to fetch the specific token balance
        try {
          const specificTokenBalance = await getSpecificTokenBalance(walletAddress, knownAddress);
          if (specificTokenBalance) {
            // Convert to MoralisWalletTokenBalanceItem format to add to moralisTokens array
            moralisTokens.push({
              token_address: specificTokenBalance.address,
              symbol: specificTokenBalance.symbol,
              name: specificTokenBalance.name,
              decimals: specificTokenBalance.decimals.toString(),
              balance: specificTokenBalance.balance,
              balance_formatted: specificTokenBalance.balanceFormatted.toString(),
              usd_price: specificTokenBalance.price,
              usd_price_24hr_percent_change: specificTokenBalance.priceChange24h,
              logo: specificTokenBalance.logo,
              verified_contract: specificTokenBalance.verified
            });
            console.log(`Added missing token ${specificTokenBalance.symbol} to token list`);
          }
        } catch (error) {
          console.error(`Error fetching specific token ${knownAddress}:`, error);
        }
      }
      
      updateLoadingProgress({
        currentBatch: 2,
        totalBatches: 9,
        message: 'Processing token data...'
      });
      
      // Step 2: Process tokens in batches
      const BATCH_SIZE = 15;
      const totalBatches = Math.ceil(moralisTokens.length / BATCH_SIZE);
      
      for (let i = 0; i < moralisTokens.length; i += BATCH_SIZE) {
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        const batchTokens = moralisTokens.slice(i, i + BATCH_SIZE);
        
        console.log(`Processing token batch ${currentBatch}/${totalBatches}, size: ${batchTokens.length}`);
        
        updateLoadingProgress({
          currentBatch: 2 + currentBatch,
          totalBatches: 9 + totalBatches - 1, // Adjust total batches to include token batches
          message: `Processing token batch ${currentBatch}/${totalBatches}...`
        });
        
        // Extract token addresses to fetch prices in batch
        const tokenAddresses = batchTokens.map(token => token.token_address);
        // Fetch price data for all tokens in this batch
        const tokenPriceMap = await moralisService.batchGetTokenPrices(tokenAddresses);
        
        // Process each token in the batch
        const processedBatchTokens = await Promise.all(batchTokens.map(async (token) => {
          try {
            // Look up token logo in our database first
            let logoUrl = null;
            const storedLogo = await storage.getTokenLogo(token.token_address);
            
            if (storedLogo) {
              logoUrl = storedLogo.logoUrl;
            } else {
              // Use default logo or Moralis logo
              logoUrl = token.logo || moralisService.getDefaultLogo(token.symbol);
              
              // Save the logo for future use
              const newLogo: InsertTokenLogo = {
                tokenAddress: token.token_address,
                logoUrl,
                symbol: token.symbol,
                name: token.name,
                lastUpdated: new Date().toISOString()
              };
              
              await storage.saveTokenLogo(newLogo);
            }
            
            // Process the token data
            const processedToken = moralisService.processTokenData(token, logoUrl);
            
            // Add price data from our batch request if available
            const priceData = tokenPriceMap[token.token_address.toLowerCase()];
            if (priceData) {
              // Update with latest price data
              processedToken.price = priceData.usdPrice;
              processedToken.priceChange24h = priceData.usdPrice24hrPercentChange;
              processedToken.value = processedToken.balanceFormatted * priceData.usdPrice;
              processedToken.exchange = priceData.exchangeName;
              
              console.log(`Added price data for ${token.symbol}: $${priceData.usdPrice}, change: ${priceData.usdPrice24hrPercentChange}%`);
            } else {
              console.log(`No price data found for token ${token.symbol}`);
            }
            
            return processedToken;
          } catch (error) {
            console.error(`Error processing token ${token.token_address}:`, error);
            return null;
          }
        }));
        
        // Add valid tokens to our array
        tokenBalances.push(...processedBatchTokens.filter(Boolean) as ProcessedToken[]);
        
        // Add a delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < moralisTokens.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error('Error fetching token balances:', error);
    }
    
    // Step 3: Ensure we have the native PLS token
    updateLoadingProgress({
      currentBatch: 6,
      totalBatches: 9,
      message: 'Checking native balance...'
    });
    
    // Check if we already have PLS in our token balances
    let plsToken = tokenBalances.find(token => 
      token.isNative === true || 
      token.symbol?.toUpperCase() === 'PLS' ||
      token.address?.toLowerCase() === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()
    );
    
    // If PLS token not found, fetch native balance directly
    if (!plsToken) {
      try {
        const nativeBalance = await moralisService.getNativeBalance(walletAddress);
        const plsPrice = await moralisService.getWrappedTokenPrice(
          moralisService.WPLS_CONTRACT_ADDRESS, 
          'PLS', 
          'PulseChain'
        );
        
        if (nativeBalance) {
          const usdPrice = plsPrice?.usdPrice || 0;
          const priceChange24h = plsPrice?.usdPrice24hrPercentChange || 0;
          
          plsToken = {
            address: moralisService.PLS_TOKEN_ADDRESS,
            symbol: 'PLS',
            name: 'PulseChain',
            decimals: 18,
            balance: nativeBalance.balance,
            balanceFormatted: nativeBalance.balanceFormatted,
            price: usdPrice,
            value: nativeBalance.balanceFormatted * usdPrice,
            priceChange24h,
            logo: moralisService.getDefaultLogo('PLS'),
            exchange: 'PulseX',
            verified: true,
            isNative: true
          };
          
          tokenBalances.push(plsToken);
          console.log(`Added native PLS token with balance ${nativeBalance.balanceFormatted}`);
        }
      } catch (error) {
        console.error('Error fetching native PLS balance:', error);
      }
    }
    
    // Step 4: Calculate total portfolio value and sort tokens by value
    updateLoadingProgress({
      currentBatch: 7,
      totalBatches: 9,
      message: 'Calculating portfolio value...'
    });
    
    // Calculate token values (price * balance) and ensure price change values
    tokenBalances = tokenBalances.map(token => {
      // If the token has a price, calculate its value
      if (token.price && token.balanceFormatted) {
        token.value = token.price * token.balanceFormatted;
      } else {
        token.value = 0;
      }
      
      // Ensure price change is a number (not undefined or null)
      if (token.priceChange24h === undefined || token.priceChange24h === null) {
        token.priceChange24h = 0;
        console.log(`Set default price change for token ${token.symbol} as it was undefined`);
      }
      
      console.log(`Processed token ${token.symbol}: price=${token.price}, priceChange24h=${token.priceChange24h}, value=${token.value}`);
      
      return token;
    });
    
    // Calculate total value
    response.totalValue = tokenBalances.reduce((total, token) => {
      return total + (token.value || 0);
    }, 0);
    
    // Sort tokens by value (highest first)
    tokenBalances.sort((a, b) => {
      const valueA = a.value || 0;
      const valueB = b.value || 0;
      return valueB - valueA;
    });
    
    // Log the top tokens by value for debugging
    console.log('Top tokens sorted by value:');
    tokenBalances.slice(0, 3).forEach((token, index) => {
      console.log(`Token ${index + 1}: ${token.symbol} = $${token.value?.toFixed(2)} (balance: ${token.balanceFormatted?.toFixed(4)})`);
    });
    
    // Step 5: Apply pagination if requested
    updateLoadingProgress({
      currentBatch: 8,
      totalBatches: 9,
      message: 'Preparing response data...'
    });
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const totalItems = tokenBalances.length;
    const totalPages = Math.ceil(totalItems / limit);
    
    // Apply pagination to the tokens (if limit is not 0)
    const paginatedTokens = limit === 0 ? tokenBalances : tokenBalances.slice(startIndex, endIndex);
    
    // Set response data
    response.tokens = paginatedTokens;
    response.tokenCount = totalItems;
    
    // Set PLS specific data (for UI elements)
    if (plsToken) {
      response.plsBalance = plsToken.balanceFormatted;
      response.plsPriceChange = plsToken.priceChange24h || null;
    }
    
    // Set network count (always 1 for PulseChain in this case)
    response.networkCount = 1;
    
    // Add pagination info if relevant
    if (limit > 0 && totalItems > limit) {
      response.pagination = {
        page,
        limit,
        totalItems,
        totalPages
      };
      
      console.log(`Pagination: page ${page}, limit ${limit}, showing tokens ${startIndex + 1}-${Math.min(endIndex, totalItems)} of ${totalItems}`);
    }
    
    // Step 6: Complete loading
    updateLoadingProgress({
      currentBatch: 9,
      totalBatches: 9,
      status: 'complete',
      message: 'Data loaded successfully'
    });
    
    return response;
  } catch (error) {
    console.error('Error in getWalletData:', error);
    
    // Update loading progress to show error
    updateLoadingProgress({
      status: 'error',
      message: `Error loading wallet data: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    
    // Return basic structure with empty data
    return {
      address: walletAddress,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: null,
      plsPriceChange: null,
      networkCount: 0
    };
  }
}

/**
 * Get wallet transaction history
 */
export /**
 * Get transaction history for a wallet with enhanced transaction type detection and token info
 * @param walletAddress The wallet address
 * @param limit Maximum number of transactions to return
 * @param cursor Pagination cursor for fetching next page
 * @returns Processed transaction history with detailed token info
 */
async function getWalletTransactions(
  walletAddress: string,
  limit: number = 100,
  cursor: string | null = null
): Promise<{
  result: Transaction[];
  cursor: string | null;
  total: number;
}> {
  try {
    walletAddress = walletAddress.toLowerCase();
    
    // Get transaction history using Moralis SDK
    const transactionHistory = await moralisService.getTransactionHistory(
      walletAddress, 
      limit, 
      cursor
    );
    
    console.log(`Processing ${transactionHistory.result.length} transactions for wallet ${walletAddress}`);
    
    // Process transaction data to ensure compatibility with frontend
    const processedTransactions = await Promise.all(transactionHistory.result.map(async (tx: any) => {
      // Log transaction details for debugging
      console.log(`Processing tx ${tx.hash}: has_erc20=${!!tx.erc20_transfers}, has_native=${!!tx.native_transfers}, method=${tx.method_label || 'Unknown'}, value=${tx.value}`);
      
      // Check if any transfers exist
      if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
        console.log(`Transaction ${tx.hash} already has ${tx.erc20_transfers.length} ERC20 transfers`);
      }
      
      // Make sure erc20_transfers is initialized
      if (!tx.erc20_transfers) {
        tx.erc20_transfers = [];
      }
      
      // Check for token transfers in logs if they weren't detected by Moralis
      if (tx.erc20_transfers.length === 0 && tx.to_address) {
        // Try checking logs to detect token transfers
        try {
          // Get token transfers directly for this transaction
          const tokenTransfers = await moralisService.getTokenTransfersForTx(tx.hash);
          
          if (tokenTransfers && tokenTransfers.length > 0) {
            console.log(`Found ${tokenTransfers.length} token transfers in transaction ${tx.hash} from logs`);
            
            // Add each token transfer to the transaction
            for (const transfer of tokenTransfers) {
              try {
                // Get token contract address from the transfer
                // Different APIs return different property names
                // Handle different property names in different API responses
                // token_address is what we use in our standardized format
                const tokenContract = transfer.token_address;
                if (!tokenContract) {
                  console.warn(`No token address found for transfer in tx ${tx.hash}`);
                  continue;
                }
                
                // Log for debugging
                console.log(`Processing token transfer for contract ${tokenContract} in tx ${tx.hash}`)
                
                const tokenData = await moralisService.getTokenMetadata(tokenContract);
                
                if (tokenData) {
                  // Create a transfer entry
                  const transferEntry = {
                    token_name: tokenData.name,
                    token_symbol: tokenData.symbol,
                    token_logo: await getTokenLogoUrl(tokenContract),
                    token_decimals: tokenData.decimals,
                    from_address: transfer.from_address,
                    to_address: transfer.to_address,
                    value: transfer.value,
                    address: tokenContract,
                    direction: transfer.from_address.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive'
                  };
                  
                  tx.erc20_transfers.push(transferEntry);
                  console.log(`Added ERC20 transfer for ${tokenData.symbol} in transaction ${tx.hash} from logs`);
                  
                  // Set method label for UI if not already set
                  if (!tx.method_label) {
                    tx.method_label = `Transfer ${tokenData.symbol}`;
                  }
                }
              } catch (error) {
                console.error(`Failed to process token transfer in ${tx.hash}:`, error);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to get token transfers for transaction ${tx.hash}:`, error);
        }
      }
      
      // If still no transfers found, try parsing the input data (as a fallback)
      if (tx.erc20_transfers.length === 0 && tx.input && tx.input.length > 10) {
        // ERC20 transfer function signature
        if (tx.input.startsWith('0xa9059cbb')) {
          try {
            // Try to get token information for the contract being called
            const tokenContract = tx.to_address;
            const tokenData = await moralisService.getTokenMetadata(tokenContract);
            
            if (tokenData) {
              // Extract parameters from input data (recipient address and amount)
              // Format: 0xa9059cbb + 32 bytes (address) + 32 bytes (amount)
              // Skip first 10 characters (0x + 8 for function signature)
              const recipientAddress = '0x' + tx.input.substring(34, 74); 
              // Amount is a hex string - need to convert to decimal
              const amountHex = tx.input.substring(74, 138);
              const amount = BigInt('0x' + amountHex).toString();
              
              // Create a token transfer entry
              const transfer = {
                token_name: tokenData.name,
                token_symbol: tokenData.symbol,
                token_logo: await getTokenLogoUrl(tokenContract),
                token_decimals: tokenData.decimals,
                from_address: tx.from_address,
                to_address: recipientAddress,
                value: amount,
                address: tokenContract,
                direction: tx.from_address.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive'
              };
              
              tx.erc20_transfers.push(transfer);
              console.log(`Added ERC20 transfer for ${tokenData.symbol} in transaction ${tx.hash} from input data`);
              
              // Set method label for UI
              if (!tx.method_label) {
                tx.method_label = `Transfer ${tokenData.symbol}`;
              }
            }
          } catch (error) {
            console.error(`Failed to parse ERC20 transfer in ${tx.hash}:`, error);
            // If error, add a basic method label
            if (!tx.method_label) {
              tx.method_label = 'Token Transfer';
            }
          }
        }
        // Add other known ERC20 methods (approvals, etc.)
        else if (tx.input.startsWith('0x095ea7b3')) {
          // This is an ERC20 approval
          try {
            const tokenContract = tx.to_address;
            const tokenData = await moralisService.getTokenMetadata(tokenContract);
            
            if (tokenData) {
              // Set method label for UI
              tx.method_label = `Approve ${tokenData.symbol}`;
              // Add a "fake" erc20_transfer to help with UI display and categorization
              const transfer = {
                token_name: tokenData.name,
                token_symbol: tokenData.symbol,
                token_logo: await getTokenLogoUrl(tokenContract),
                token_decimals: tokenData.decimals,
                from_address: tx.from_address,
                to_address: tx.to_address,
                value: '0', // Approval doesn't transfer tokens
                address: tokenContract,
                direction: 'approval'
              };
              
              tx.erc20_transfers.push(transfer);
              console.log(`Added ERC20 approval for ${tokenData.symbol} in transaction ${tx.hash}`);
            }
          } catch (error) {
            console.error(`Failed to parse ERC20 approval in ${tx.hash}:`, error);
            // Default approval label if we can't get token data
            if (!tx.method_label) {
              tx.method_label = 'Token Approval';
            }
          }
        } else {
          // Try to analyze using the transaction analyzer
          try {
            // Run a detailed transaction analysis to get better information
            // This will check function signatures, token movements, and contract addresses
            console.log(`Using transaction analyzer to identify transaction type for ${tx.hash}`);
            const txDetails = await transactionAnalyzer.analyzeTransaction(tx, walletAddress);
            
            // Update with more specific method based on the analysis
            if (txDetails.methodName && txDetails.methodName !== 'Contract Interaction') {
              tx.method_label = txDetails.methodName;
              tx.category = txDetails.type;
              console.log(`Transaction analyzer identified ${tx.hash} as ${txDetails.type}: ${txDetails.methodName}`);
              
              // For swap transactions, add the swap details
              if (txDetails.type === 'swap' && txDetails.tokens.sent.length > 0 && txDetails.tokens.received.length > 0) {
                tx.swap_details = {
                  sent: txDetails.tokens.sent.map(t => ({
                    symbol: t.symbol,
                    amount: t.amountFormatted || '0',
                    address: t.address
                  })),
                  received: txDetails.tokens.received.map(t => ({
                    symbol: t.symbol,
                    amount: t.amountFormatted || '0',
                    address: t.address
                  }))
                };
              }
            } else {
              // If no specific method detected, use basic fallback
              if (!tx.method_label) {
                tx.method_label = 'Contract Interaction';
              }
            }
          } catch (error) {
            console.error(`Transaction analyzer error for ${tx.hash}:`, error);
            // For all other contract interactions
            if (!tx.method_label) {
              tx.method_label = 'Contract Interaction';
            }
          }
        }
      }
      
      // Process native transfers
      if (!tx.native_transfers) {
        tx.native_transfers = [];
        
        // If this is a simple ETH transfer with value > 0, add it as a native transfer
        if (tx.value && tx.value !== '0' && !tx.receipt_contract_address) {
          const nativeTransfer = {
            token_name: 'PulseChain',
            token_symbol: 'PLS',
            token_logo: moralisService.getDefaultLogo('PLS'),
            token_decimals: '18',
            from_address: tx.from_address,
            to_address: tx.to_address,
            value: tx.value,
            address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Standard placeholder for native token
            direction: tx.from_address.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive'
          };
          
          tx.native_transfers.push(nativeTransfer);
        }
      }
      
      // Detect swap transactions
      const detectSwapTransaction = () => {
        // Common DEX router addresses on PulseChain (all lowercase)
        const knownRouterAddresses = [
          // PulseX router
          '0x165c68077ac06c83800d19200e6e2b08d02de75c',
          // Velocity router
          '0xda9aba4eacf54e0273f56dffee6b8f1e20b23bba',
          // PulseX v2 router
          '0x98bf93ebf5c380c0e6daeda0b0e9894a57779dfb',
          // PLDEX router
          '0xb4959bebfc2919da68119ac8efa1b57382e69089',
          // ThorSwap router
          '0xc145990e84155416144c532e31642d04dbd5a14a',
          // HEX / HEX UI contracts
          '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
          '0x9a67f1940164d0318612b497e8e6038f902a00a4',
        ];

        // Check if the tx is interacting with a known router
        const isRouterInteraction = knownRouterAddresses.includes(tx.to_address?.toLowerCase() || '');
        
        // Look at token transfers - a swap typically has at least 2 token transfers
        // (one outgoing and one incoming token) or token + native token
        let incomingTokens: any[] = [];
        let outgoingTokens: any[] = [];
        
        // Check ERC20 token transfers
        tx.erc20_transfers?.forEach((transfer: any) => {
          if (transfer.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
            outgoingTokens.push({
              symbol: transfer.token_symbol,
              value: transfer.value,
              decimals: transfer.token_decimals,
              address: transfer.address
            });
          }
          if (transfer.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
            incomingTokens.push({
              symbol: transfer.token_symbol,
              value: transfer.value,
              decimals: transfer.token_decimals,
              address: transfer.address
            });
          }
        });
        
        // Check native transfers
        tx.native_transfers?.forEach((transfer: any) => {
          if (transfer.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
            outgoingTokens.push({
              symbol: transfer.token_symbol,
              value: transfer.value,
              decimals: transfer.token_decimals,
              address: transfer.address
            });
          }
          if (transfer.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
            incomingTokens.push({
              symbol: transfer.token_symbol,
              value: transfer.value,
              decimals: transfer.token_decimals,
              address: transfer.address
            });
          }
        });
        
        // Also check for swap function signatures in the input data
        const isSwapMethod = 
          tx.input?.startsWith('0x7ff36ab5') || // swapExactTokensForETH
          tx.input?.startsWith('0x38ed1739') || // swapExactTokensForTokens
          tx.input?.startsWith('0x4a25d94a') || // swapTokensForExactETH
          tx.input?.startsWith('0x18cbafe5') || // swapExactETHForTokens
          tx.input?.startsWith('0x8803dbee') || // swapTokensForExactTokens
          tx.input?.startsWith('0xfb3bdb41') || // swapETHForExactTokens
          tx.input?.startsWith('0x5c11d795');   // swapExactTokensForTokensSupportingFeeOnTransferTokens
        
        // A swap typically has token flow in both directions
        const hasSwapTokenFlow = incomingTokens.length > 0 && outgoingTokens.length > 0;
        
        // Determine if this is a swap
        const isSwap = (isRouterInteraction || isSwapMethod) && hasSwapTokenFlow;
        
        if (isSwap) {
          // Set swap information
          tx.category = 'swap';
          
          if (incomingTokens.length > 0 && outgoingTokens.length > 0) {
            // Format the token values for display
            const formatTokenValue = (token: any) => {
              if (!token.decimals || !token.value) return '0';
              // Handle different decimal precision
              const decimals = parseInt(token.decimals);
              const rawValue = BigInt(token.value);
              return (Number(rawValue) / Math.pow(10, decimals)).toFixed(6);
            };
            
            const inToken = incomingTokens[0];
            const outToken = outgoingTokens[0];
            
            // Set a more informative method label for the swap
            tx.method_label = `Swap ${formatTokenValue(outToken)} ${outToken.symbol} for ${formatTokenValue(inToken)} ${inToken.symbol}`;
            
            // Add swap details to help the UI display more information
            tx.swap_details = {
              sent: outgoingTokens.map(t => ({ 
                symbol: t.symbol, 
                amount: formatTokenValue(t),
                address: t.address
              })),
              received: incomingTokens.map(t => ({ 
                symbol: t.symbol, 
                amount: formatTokenValue(t),
                address: t.address
              }))
            };
          }
        }
        
        return isSwap;
      };
      
      // Detect liquidity operations
      const detectLiquidityOperation = () => {
        // LP-related function signatures
        const isAddLiquidity = 
          tx.input?.startsWith('0xe8e33700') || // addLiquidity
          tx.input?.startsWith('0xf305d719') || // addLiquidityETH
          tx.input?.startsWith('0x4515cef3');   // addLiquidityETHSupportingFeeOnTransferTokens
          
        const isRemoveLiquidity = 
          tx.input?.startsWith('0xbaa2abde') || // removeLiquidity
          tx.input?.startsWith('0x02751cec') || // removeLiquidityETH
          tx.input?.startsWith('0xaf2979eb') || // removeLiquidityETHSupportingFeeOnTransferTokens
          tx.input?.startsWith('0xded9382a') || // removeLiquidityETHWithPermit
          tx.input?.startsWith('0x2195995c');   // removeLiquidityWithPermit
        
        if (isAddLiquidity || isRemoveLiquidity) {
          tx.category = isAddLiquidity ? 'liquidity_add' : 'liquidity_remove';
          tx.method_label = isAddLiquidity ? 'Add Liquidity' : 'Remove Liquidity';
          
          // Try to identify the tokens involved in the liquidity operation
          const tokensInvolved = new Set<string>();
          tx.erc20_transfers?.forEach((transfer: any) => {
            if (transfer.token_symbol) {
              tokensInvolved.add(transfer.token_symbol);
            }
          });
          
          if (tokensInvolved.size > 0) {
            tx.method_label += `: ${Array.from(tokensInvolved).join('/')}`;
          }
          
          return true;
        }
        
        return false;
      };
      
      // Detect staking/unstaking operations
      const detectStakingOperation = () => {
        // Special case for HEX staking
        const isHexContract = tx.to_address?.toLowerCase() === '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
        
        // HEX-specific functions
        const isHexStake = isHexContract && (
          tx.input?.startsWith('0x93fa31f1') || // stakeStart
          tx.input?.startsWith('0xd9a99b82')    // stakeStart with days and amount in one function
        );
        
        const isHexUnstake = isHexContract && (
          tx.input?.startsWith('0x835c15c5') || // stakeEnd
          tx.input?.startsWith('0x3aa3e5f3') || // stakeGoodAccounting
          tx.input?.startsWith('0x9bdd9b38')    // stakeEarlyEnd
        );
        
        // General staking methods for other contracts
        // Note: These are generic signatures, specific protocols may have different ones
        const isStaking = 
          tx.input?.startsWith('0xa694fc3a') || // stake
          tx.input?.startsWith('0xadc9772e') || // deposit (often used for staking)
          tx.input?.startsWith('0xe2bbb158') || // deposit method for some staking contracts
          isHexStake;                           // HEX staking
        
        const isUnstaking = 
          tx.input?.startsWith('0x2e1a7d4d') || // withdraw
          tx.input?.startsWith('0x853828b6') || // unstake
          tx.input?.startsWith('0x441a3e70') || // withdraw for some staking contracts
          isHexUnstake;                         // HEX unstaking
          
        // PulseChain-specific yield/staking contracts
        const knownStakingContracts = [
          // HEX contract
          '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
          // PulseX IFO/MAXIMUS
          '0x075dbb8b2ea6929ee58d552b5b2e5510b08ef028',
          // pHEX-PLS LP Staking
          '0xb79dd08ea68a908a97220c76d19a6aa9cbde4376',
          // Additional staking contracts can be added here
        ];
        
        const isKnownStakingContract = knownStakingContracts.includes(tx.to_address?.toLowerCase() || '');
        
        // Check if this is a staking transaction by address even if we don't recognize the method
        if (isKnownStakingContract && !isStaking && !isUnstaking) {
          // If we can't identify if it's staking or unstaking, look at token flows
          let incomingTokensCount = 0;
          let outgoingTokensCount = 0;
          
          // Check ERC20 token transfers
          tx.erc20_transfers?.forEach((transfer: any) => {
            if (transfer.from_address?.toLowerCase() === walletAddress.toLowerCase()) {
              outgoingTokensCount++;
            }
            if (transfer.to_address?.toLowerCase() === walletAddress.toLowerCase()) {
              incomingTokensCount++;
            }
          });
          
          // More incoming than outgoing typically means unstaking (getting rewards)
          if (incomingTokensCount > outgoingTokensCount) {
            // Set transaction as unstaking
            tx.category = 'unstake';
            tx.method_label = 'Unstake';
          } else if (outgoingTokensCount > incomingTokensCount) {
            // Set transaction as staking
            tx.category = 'stake';
            tx.method_label = 'Stake';
          }
          // If equal or none, leave as is
        }
        
        // Special case for HEX
        if (isHexContract) {
          // HEX-specific handling
          if (isHexStake) {
            tx.method_label = 'Start HEX Stake';
            return true;
          } else if (isHexUnstake) {
            tx.method_label = 'End HEX Stake';
            // Check if it was an early end (penalty)
            if (tx.input?.startsWith('0x9bdd9b38')) {
              tx.method_label += ' (Early)';
            }
            return true;
          }
        }
        
        if (isStaking || isUnstaking) {
          tx.category = isStaking ? 'stake' : 'unstake';
          tx.method_label = isStaking ? 'Stake' : 'Unstake';
          
          // Try to identify the token being staked/unstaked
          if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
            const firstTransfer = tx.erc20_transfers[0];
            if (firstTransfer.token_symbol) {
              tx.method_label += ` ${firstTransfer.token_symbol}`;
            }
          }
          
          return true;
        }
        
        return false;
      };
      
      // Final analysis pass - Run transaction analyzer for all transactions to extract comprehensive details
      try {
        // Only run the analyzer if we haven't already analyzed this transaction earlier
        if (!tx.analyzed) {
          console.log(`Running comprehensive transaction analysis for ${tx.hash}`);
          
          // Get detailed transaction analysis
          const txAnalysis = await transactionAnalyzer.analyzeTransaction(tx, walletAddress);
          
          // Only update category/method if we get a specific transaction type (not 'unknown' or 'contract')
          if (txAnalysis.type !== 'unknown' && txAnalysis.type !== 'contract') {
            tx.category = txAnalysis.type;
            
            // Only update method_label if we got a better description than "Contract Interaction"
            if (txAnalysis.methodName && txAnalysis.methodName !== 'Contract Interaction' && 
                (!tx.method_label || tx.method_label === 'Contract Interaction')) {
              tx.method_label = txAnalysis.methodName;
            }
            
            console.log(`Transaction analyzer identified ${tx.hash} as ${txAnalysis.type}: ${txAnalysis.methodName}`);
          }
          
          // For swap transactions, ensure we set swap details for UI rendering
          if (txAnalysis.type === 'swap' && txAnalysis.tokens.sent.length > 0 && txAnalysis.tokens.received.length > 0) {
            // Only update swap details if we don't already have them
            if (!tx.swap_details) {
              tx.swap_details = {
                sent: txAnalysis.tokens.sent.map(t => ({
                  symbol: t.symbol,
                  amount: t.amountFormatted || '0',
                  address: t.address
                })),
                received: txAnalysis.tokens.received.map(t => ({
                  symbol: t.symbol,
                  amount: t.amountFormatted || '0',
                  address: t.address
                }))
              };
              
              console.log(`Added swap details for ${tx.hash}: ${txAnalysis.tokens.sent.length} sent tokens, ${txAnalysis.tokens.received.length} received tokens`);
            }
          }
          
          // Mark as analyzed to avoid redundant processing
          tx.analyzed = true;
        }
      } catch (error) {
        console.error(`Error in transaction analysis for ${tx.hash}:`, error);
      }
      
      // Ensure category is set - Apply detection in sequence as fallback if needed
      if (!tx.category) {
        // First check for swaps
        const isSwap = detectSwapTransaction();
        
        // If not a swap, check for liquidity operations
        if (!isSwap) {
          const isLiquidityOp = detectLiquidityOperation();
          
          // If not liquidity, check for staking
          if (!isLiquidityOp) {
            const isStakingOp = detectStakingOperation();
            
            // If none of the above, use basic categorization
            if (!isStakingOp) {
              // Basic categorization based on token transfers
              if (tx.method_label?.toLowerCase().includes('approve')) {
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
              } else {
                tx.category = 'contract';
              }
            }
          }
        }
      }
      
      return tx;
    }));
    
    return {
      result: processedTransactions as unknown as Transaction[],
      cursor: transactionHistory.cursor || null,
      total: transactionHistory.total || transactionHistory.result.length
    };
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    
    return {
      result: [],
      cursor: null,
      total: 0
    };
  }
}

/**
 * Get token price information
 */
export async function getTokenPriceInfo(tokenAddress: string) {
  try {
    return await moralisService.getTokenPrice(tokenAddress);
  } catch (error) {
    console.error(`Error fetching token price info for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get batch token prices for multiple tokens
 */
export async function getBatchTokenPrices(tokenAddresses: string[]) {
  try {
    // Normalize addresses to lowercase
    const normalizedAddresses = tokenAddresses.map(addr => addr.toLowerCase());
    
    // Remove duplicates without using Set spreading (which has type issues)
    const uniqueAddresses: string[] = [];
    normalizedAddresses.forEach(addr => {
      if (!uniqueAddresses.includes(addr)) {
        uniqueAddresses.push(addr);
      }
    });
    
    // Get prices
    return await moralisService.batchGetTokenPrices(uniqueAddresses);
  } catch (error) {
    console.error('Error fetching batch token prices:', error);
    return {};
  }
}

/**
 * Get specific token balance for a wallet
 */
export async function getSpecificTokenBalance(walletAddress: string, tokenAddress: string): Promise<ProcessedToken | null> {
  try {
    walletAddress = walletAddress.toLowerCase();
    tokenAddress = tokenAddress.toLowerCase();
    
    console.log(`Fetching specific token balance for ${tokenAddress} in wallet ${walletAddress}`);
    
    // Special case for native token
    if (tokenAddress === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()) {
      try {
        // Get native balance directly
        const nativeBalance = await moralisService.getNativeBalance(walletAddress);
        const plsPrice = await moralisService.getWrappedTokenPrice(
          moralisService.WPLS_CONTRACT_ADDRESS, 
          'PLS', 
          'PulseChain'
        );
        
        if (nativeBalance) {
          const usdPrice = plsPrice?.usdPrice || 0;
          const priceChange24h = plsPrice?.usdPrice24hrPercentChange || 0;
          
          return {
            address: moralisService.PLS_TOKEN_ADDRESS,
            symbol: 'PLS',
            name: 'PulseChain',
            decimals: 18,
            balance: nativeBalance.balance,
            balanceFormatted: nativeBalance.balanceFormatted,
            price: usdPrice,
            value: nativeBalance.balanceFormatted * usdPrice,
            priceChange24h,
            logo: moralisService.getDefaultLogo('PLS'),
            exchange: 'PulseX',
            verified: true,
            isNative: true
          };
        }
      } catch (error) {
        console.error('Error fetching native token balance:', error);
      }
    }
    
    // For ERC20 tokens, we'll try to use the token metadata + balance APIs
    try {
      // First get the token metadata
      const tokenMetadata = await moralisService.getTokenMetadata(tokenAddress);
      
      if (!tokenMetadata) {
        return null;
      }
      
      // Then get its balance for this wallet
      const response = await Moralis.EvmApi.token.getWalletTokenBalances({
        chain: moralisService.PULSECHAIN_CHAIN_ID,
        address: walletAddress,
        tokenAddresses: [tokenAddress]
      });
      
      if (!response || !response.raw || response.raw.length === 0) {
        // Token exists but wallet has no balance
        return {
          address: tokenAddress,
          symbol: tokenMetadata.symbol,
          name: tokenMetadata.name,
          decimals: parseInt(tokenMetadata.decimals),
          balance: '0',
          balanceFormatted: 0,
          price: 0, // We'll get price separately
          value: 0,
          logo: await getTokenLogoUrl(tokenAddress),
          exchange: '',
          verified: !!tokenMetadata.verified_contract,
          isNative: false
        };
      }
      
      // Get token balance from response
      const tokenBalance = response.raw[0];
      
      // Ensure the tokenBalance has balance_formatted property and other required fields
      // Use type assertion to handle API response with potentially different fields
      const tokenData = tokenBalance as any; // This allows us to add properties
      
      if (!tokenData.balance_formatted) {
        const decimals = parseInt(tokenData.decimals);
        const balanceValue = parseFloat(tokenData.balance);
        tokenData.balance_formatted = (balanceValue / Math.pow(10, decimals)).toString();
      }
      
      // Get token price
      const priceData = await getTokenPriceInfo(tokenAddress);
      
      // Format the token data
      // Handle the balance formatting manually if necessary
      const balanceFormatted = parseFloat(tokenData.balance_formatted || '0');
      // Use type assertion to handle potential missing properties in tokenBalance
      return {
        address: tokenAddress,
        symbol: tokenData.symbol,
        name: tokenData.name,
        decimals: parseInt(tokenData.decimals.toString()),
        balance: tokenData.balance,
        balanceFormatted: balanceFormatted,
        price: priceData?.usdPrice || 0,
        value: balanceFormatted * (priceData?.usdPrice || 0),
        priceChange24h: priceData?.usdPrice24hrPercentChange,
        logo: await getTokenLogoUrl(tokenAddress),
        exchange: priceData?.exchangeName || '',
        verified: !!tokenData.verified_contract,
        isNative: false
      };
    } catch (error) {
      console.error(`Error fetching token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.error(`Error in getSpecificTokenBalance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Helper function to get token logo URL from storage or default
 */
async function getTokenLogoUrl(tokenAddress: string): Promise<string> {
  try {
    // Check if we have the logo in our database
    const storedLogo = await storage.getTokenLogo(tokenAddress);
    
    if (storedLogo) {
      return storedLogo.logoUrl;
    }
    
    // If not, return default logo based on token
    if (tokenAddress.toLowerCase() === moralisService.PLS_TOKEN_ADDRESS.toLowerCase()) {
      return moralisService.getDefaultLogo('PLS');
    }
    
    // Return generic default
    return '/assets/100xfrenlogo.png';
  } catch (error) {
    console.error(`Error getting token logo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return '/assets/100xfrenlogo.png';
  }
}