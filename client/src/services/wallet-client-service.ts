/**
 * Client-side wallet service that fetches token balances from server
 * and prices/logos from DexScreener directly in the browser
 */

// Removed DexScreener dependency - using smart contract prices directly
import { getTokenPriceFromContract, getMultipleTokenPricesFromContract } from './smart-contract-price-service';

// Blacklist of known dust tokens to filter out
const DUST_TOKEN_BLACKLIST = new Set<string>([
  // Add dust token addresses here in lowercase
  // Example: '0x1234567890abcdef...',
]);

// Import types directly from server since they're not in shared schema
interface ProcessedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: number;
  price?: number;
  value?: number;
  priceChange24h?: number;
  logo?: string;
  exchange?: string;
  verified?: boolean;
  securityScore?: number;
  isNative?: boolean;
  isLp?: boolean;
}

interface Wallet {
  address: string;
  tokens: ProcessedToken[];
  totalValue: number;
  tokenCount: number;
  plsBalance: number | undefined;
  plsPriceChange: number | undefined;
  networkCount: number;
  pricesNeeded?: boolean;
}

interface TokenWithPrice extends ProcessedToken {
  priceData?: TokenPriceData;
}

/**
 * Fetch wallet balances using scanner API (gets ALL tokens, not just recent)
 */
async function fetchWalletBalancesFromScanner(address: string): Promise<Wallet> {
  const response = await fetch(`/api/wallet/${address}/scanner-balances`);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to fetch wallet balances');
  }
  
  return response.json();
}

/**
 * Save logo fetched from DexScreener to server
 */
async function saveLogoToServer(tokenAddress: string, logoUrl: string, symbol?: string, name?: string): Promise<void> {
  try {
    const response = await fetch('/api/token-logos/save-from-client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tokenAddress,
        logoUrl,
        symbol,
        name
      })
    });
    
    if (!response.ok) {
      console.error('Failed to save logo to server:', await response.text());
    }
  } catch (error) {
    console.error('Error saving logo to server:', error);
  }
}

/**
 * Fetch wallet data with client-side price fetching
 * This reduces server API calls and distributes load across users
 */
export async function fetchWalletDataClientSide(
  address: string, 
  onProgress?: (message: string, progress: number) => void
): Promise<Wallet> {
  try {
    // Step 1: Fetch ALL token balances using scanner API
    if (onProgress) onProgress('Fetching all wallet tokens...', 10);
    const walletDataRaw = await fetchWalletBalancesFromScanner(address);
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      return walletData;
    }
    
    // Step 2: Fetch prices from DexScreener client-side
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    let processedCount = 0;
    
    // Process in batches to avoid overwhelming DexScreener
    const BATCH_SIZE = 5;
    const batches: TokenWithPrice[][] = [];
    
    for (let i = 0; i < tokensWithPrices.length; i += BATCH_SIZE) {
      batches.push(tokensWithPrices.slice(i, i + BATCH_SIZE));
    }
    
    if (onProgress) onProgress('Fetching token logos...', 30);
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      await Promise.all(
        batch.map(async (token) => {
          try {
            // For PLS native token, use WPLS address
            let tokenAddressForDex = token.address;
            if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
              tokenAddressForDex = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
            }
            
            // Only fetch logos from DexScreener, NOT prices
            // Prices come from smart contracts via the server
            const priceData = await getTokenPriceFromDexScreener(tokenAddressForDex);
            
            if (priceData && priceData.logo && (!token.logo || token.logo === '')) {
              token.logo = priceData.logo;
              
              // Save logo to server in background
              saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
            }
          } catch (error) {
            console.error(`Failed to fetch data for ${token.symbol}:`, error);
          }
          
          processedCount++;
          const progress = Math.round(30 + (processedCount / totalTokens) * 60); // 30% to 90%
          if (onProgress) onProgress(`Fetching logos... (${processedCount}/${totalTokens})`, progress);
        })
      );
      
      // Small delay between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Step 3: Calculate total value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Step 4: Sort by value
    tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    if (onProgress) onProgress('Processing complete', 100);
    
    return {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue,
      plsBalance: walletData.plsBalance ?? undefined,
      plsPriceChange: walletData.plsPriceChange ?? undefined
    };
  } catch (error) {
    console.error('Error fetching wallet data client-side:', error);
    throw error;
  }
}

/**
 * Fetch wallet data using direct smart contract price reading for real-time prices
 * This provides faster updates (1-2 seconds) compared to DexScreener (30-60 seconds)
 */
export async function fetchWalletDataWithContractPrices(
  address: string, 
  onProgress?: (message: string, progress: number) => void
): Promise<Wallet> {
  try {
    // Step 1: Fetch ALL token balances using scanner API
    if (onProgress) onProgress('Fetching all wallet tokens...', 10);
    const walletDataRaw = await fetchWalletBalancesFromScanner(address);
    
    // Convert null values to undefined for proper type compatibility
    const walletData: Wallet = {
      ...walletDataRaw,
      plsBalance: walletDataRaw.plsBalance ?? undefined,
      plsPriceChange: walletDataRaw.plsPriceChange ?? undefined
    };
    
    if (!walletData.tokens || walletData.tokens.length === 0) {
      return walletData;
    }
    
    // Step 2: Fetch prices from smart contracts directly
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    
    if (onProgress) onProgress('Reading prices from blockchain...', 30);
    
    // Prepare token addresses for batch price fetching
    const tokenAddresses = tokensWithPrices.map(token => {
      // For PLS native token, use WPLS price
      if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
      }
      return token.address;
    });
    
    // Fetch all prices in batches from smart contracts
    const priceMap = await getMultipleTokenPricesFromContract(tokenAddresses);
    
    // Step 3: Fetch logos using batch endpoint
    if (onProgress) onProgress('Fetching token logos...', 50);
    
    // Get tokens without logos
    const tokensWithoutLogos = tokensWithPrices.filter(t => !t.logo || t.logo === '');
    
    if (tokensWithoutLogos.length > 0) {
      try {
        // Use batch endpoint to fetch all logos at once (max 100 per batch)
        const BATCH_SIZE = 100;
        const addresses = tokensWithoutLogos.map(t => t.address);
        
        for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
          const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
          
          const response = await fetch('/api/token-logos/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: batchAddresses })
          });
          
          if (response.ok) {
            const logoMap = await response.json();
            
            // Apply logos to tokens
            tokensWithoutLogos.forEach(token => {
              const logoData = logoMap[token.address.toLowerCase()];
              if (logoData?.logoUrl) {
                token.logo = logoData.logoUrl;
              }
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch logos in batch:', error);
      }
    }
    
    // Apply prices to tokens
    let processedCount = 0;
    tokensWithPrices.forEach((token, index) => {
      const addressForPrice = tokenAddresses[index];
      const priceData = priceMap.get(addressForPrice.toLowerCase());
      
      if (priceData) {
        // Check if token is in blacklist
        const isBlacklisted = DUST_TOKEN_BLACKLIST.has(token.address.toLowerCase());
        
        if (isBlacklisted) {
          token.price = 0; // Set price to 0 for blacklisted dust tokens
          token.value = 0;
          token.priceData = undefined;
        } else {
          token.price = priceData.price;
          token.value = token.balanceFormatted * priceData.price;
          // Store minimal price data for UI (keep existing logo)
          token.priceData = {
            price: priceData.price,
            priceChange24h: 0, // Contract method doesn't provide 24h change
            liquidityUsd: priceData.liquidity,
            volumeUsd24h: 0, // Contract method doesn't provide volume
            dexId: 'pulsex',
            pairAddress: priceData.pairAddress,
            logo: token.logo // Preserve logo from server
          };
        }
      }
      
      processedCount++;
      const progress = Math.round(30 + (processedCount / totalTokens) * 60); // 30% to 90%
      if (onProgress) onProgress(`Processing prices... (${processedCount}/${totalTokens})`, progress);
    });
    
    // Step 3: Calculate total value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    // Step 4: Sort by value
    tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
    
    if (onProgress) onProgress('Processing complete', 100);
    
    return {
      ...walletData,
      tokens: tokensWithPrices,
      totalValue,
      plsBalance: walletData.plsBalance ?? undefined,
      plsPriceChange: walletData.plsPriceChange ?? undefined
    };
  } catch (error) {
    console.error('Error fetching wallet data with contract prices:', error);
    throw error;
  }
}

/**
 * Background batch logo fetcher for tokens without logos
 */
export async function fetchMissingLogosInBackground(tokens: ProcessedToken[]): Promise<void> {
  const tokensWithoutLogos = tokens.filter(t => 
    !t.logo || t.logo === '' || t.logo.includes('placeholder')
  );
  
  if (tokensWithoutLogos.length === 0) return;
  
  console.log(`Starting background logo fetch for ${tokensWithoutLogos.length} tokens`);
  
  // Process tokens in smaller batches with delays to prevent system overload
  const BATCH_SIZE = 20; // Reduced batch size for better performance
  const BATCH_DELAY = 2000; // 2 second delay between batches
  const MAX_CONCURRENT = 5; // Maximum concurrent requests per batch
  
  // Process batches sequentially with delays
  for (let i = 0; i < tokensWithoutLogos.length; i += BATCH_SIZE) {
    const batch = tokensWithoutLogos.slice(i, i + BATCH_SIZE);
    
    // Process tokens within batch with limited concurrency
    const chunks = [];
    for (let j = 0; j < batch.length; j += MAX_CONCURRENT) {
      chunks.push(batch.slice(j, j + MAX_CONCURRENT));
    }
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (token) => {
          try {
            const priceData = await getTokenPriceFromDexScreener(token.address);
            
            if (priceData?.logo) {
              // Save logo to server
              await saveLogoToServer(token.address, priceData.logo, token.symbol, token.name);
              console.log(`Saved logo for ${token.symbol}`);
            }
          } catch (error) {
            console.error(`Failed to fetch logo for ${token.symbol}:`, error);
          }
        })
      );
      
      // Small delay between chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Delay between batches (except for the last batch)
    if (i + BATCH_SIZE < tokensWithoutLogos.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  console.log('Background logo fetch completed');
}