/**
 * Client-side wallet service that fetches token balances from server
 * and prices/logos from DexScreener directly in the browser
 */

// Removed DexScreener dependency - using smart contract prices directly
import { getTokenPriceFromContract, getMultipleTokenPricesFromContract } from './smart-contract-price-service';
import { requestDeduplicator } from '@/lib/request-deduplicator';
import { PerformanceTimer } from '@/utils/performance-timer';
import { fetchTokenBalancesFromBrowser } from './scanner-client-service';
import { fetchMultipleTokenLogos } from './dexscreener-logo-service';
import { ethers } from 'ethers';

// Blacklist of known dust tokens to filter out
const DUST_TOKEN_BLACKLIST = new Set<string>([
  // Add dust token addresses here in lowercase
  // Example: '0x1234567890abcdef...',
]);

// RPC provider for blockchain calls
const getRpcProvider = () => {
  return new ethers.providers.JsonRpcProvider('https://rpc-pulsechain.g4mm4.io');
};

// ERC20 ABI for basic token functions
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

// PulseX LP pair ABI for getting reserves and tokens
const LP_PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
];

/**
 * Analyze LP token client-side to get underlying token balances and values
 */
async function analyzeLpTokenClientSide(token: ProcessedToken, priceMap: Map<string, any>): Promise<ProcessedToken> {
  try {
    console.log(`🔬 Analyzing LP token ${token.symbol} client-side...`);
    const provider = getRpcProvider();
    
    // Create contract instance for LP pair
    const lpContract = new ethers.Contract(token.address, LP_PAIR_ABI, provider);
    
    // Get underlying token addresses
    const [token0Address, token1Address] = await Promise.all([
      lpContract.token0(),
      lpContract.token1()
    ]);
    
    console.log(`LP ${token.symbol} contains tokens:`, { token0Address, token1Address });
    
    // Get reserves and total supply
    const [reserves, totalSupply] = await Promise.all([
      lpContract.getReserves(),
      lpContract.totalSupply()
    ]);
    
    const lpBalance = ethers.BigNumber.from(token.balance);
    const totalSupplyBN = ethers.BigNumber.from(totalSupply);
    
    // Calculate user's share of the pool
    const userShareRatio = lpBalance.mul(ethers.constants.WeiPerEther).div(totalSupplyBN);
    
    // Get token contracts for metadata
    const token0Contract = new ethers.Contract(token0Address, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(token1Address, ERC20_ABI, provider);
    
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol(),
      token0Contract.decimals(),
      token1Contract.symbol(),
      token1Contract.decimals()
    ]);
    
    // Calculate underlying token balances
    const token0ReserveBN = ethers.BigNumber.from(reserves.reserve0);
    const token1ReserveBN = ethers.BigNumber.from(reserves.reserve1);
    
    const token0Balance = token0ReserveBN.mul(userShareRatio).div(ethers.constants.WeiPerEther);
    const token1Balance = token1ReserveBN.mul(userShareRatio).div(ethers.constants.WeiPerEther);
    
    const token0BalanceFormatted = parseFloat(ethers.utils.formatUnits(token0Balance, token0Decimals));
    const token1BalanceFormatted = parseFloat(ethers.utils.formatUnits(token1Balance, token1Decimals));
    
    // Get prices for underlying tokens
    const token0PriceData = priceMap.get(token0Address.toLowerCase());
    const token1PriceData = priceMap.get(token1Address.toLowerCase());
    const token0Price = token0PriceData?.price || 0;
    const token1Price = token1PriceData?.price || 0;
    
    // Calculate values
    const token0Value = token0BalanceFormatted * token0Price;
    const token1Value = token1BalanceFormatted * token1Price;
    const totalLpValue = token0Value + token1Value;
    
    console.log(`✅ LP ${token.symbol} analysis complete:`, {
      token0: `${token0BalanceFormatted.toFixed(6)} ${token0Symbol} ($${token0Value.toFixed(2)})`,
      token1: `${token1BalanceFormatted.toFixed(6)} ${token1Symbol} ($${token1Value.toFixed(2)})`,
      totalValue: `$${totalLpValue.toFixed(2)}`
    });
    
    // Return enhanced token with LP data
    return {
      ...token,
      isLp: true,
      lpToken0Address: token0Address,
      lpToken1Address: token1Address,
      lpToken0Symbol: token0Symbol,
      lpToken1Symbol: token1Symbol,
      lpToken0BalanceFormatted: token0BalanceFormatted,
      lpToken1BalanceFormatted: token1BalanceFormatted,
      lpToken0Value: token0Value,
      lpToken1Value: token1Value,
      value: totalLpValue,
      price: totalLpValue / token.balanceFormatted, // Price per LP token
      needsLpAnalysis: undefined
    };
    
  } catch (error) {
    console.error(`❌ Failed to analyze LP token ${token.symbol}:`, error);
    return {
      ...token,
      needsLpAnalysis: undefined
    };
  }
}

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
  needsLpAnalysis?: boolean;
  lpToken0Address?: string;
  lpToken1Address?: string;
  lpToken0Symbol?: string;
  lpToken1Symbol?: string;
  lpToken0BalanceFormatted?: number;
  lpToken1BalanceFormatted?: number;
  lpToken0Value?: number;
  lpToken1Value?: number;
  lpToken0Price?: number;
  lpToken1Price?: number;
  priceData?: any;
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
  error?: string;
}

interface TokenPriceData {
  price: number;
  priceChange24h: number;
  liquidityUsd: number;
  volumeUsd24h: number;
  dexId: string;
  pairAddress: string;
  logo?: string;
}

interface TokenWithPrice extends ProcessedToken {
  priceData?: TokenPriceData;
}

/**
 * Fetch wallet balances using the same API as portfolio loading
 * This ensures consistency between single wallet and multi-wallet views
 */
async function fetchWalletBalancesFromScanner(address: string, retries = 3, useFastEndpoint = false): Promise<Wallet> {
  try {
    console.log(`Fetching wallet data for ${address} using server API (same as portfolio)`);
    
    // Use the same API endpoint as portfolio loading - try fast scanner first for better reliability
    const response = await fetch(`/api/wallet/${address}/fast-balances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      // Try enhanced endpoint as fallback (though it often fails with 504)
      console.log(`Fast endpoint failed, trying enhanced endpoint for ${address}`);
      const enhancedResponse = await fetch(`/api/wallet/${address}/enhanced-balances`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!enhancedResponse.ok) {
        throw new Error(`Both fast and enhanced endpoints failed: ${response.status} / ${enhancedResponse.status}`);
      }
      
      const data = await enhancedResponse.json();
      return {
        address,
        tokens: data.tokens || [],
        totalValue: 0, // Will be calculated after prices are fetched
        tokenCount: data.tokens?.length || 0,
        plsBalance: data.plsBalance || 0,
        plsPriceChange: 0,
        networkCount: 1,
        pricesNeeded: true
      };
    }
    
    const data = await response.json();
    
    console.log(`Successfully fetched wallet data from API:`, {
      address,
      tokenCount: data.tokens?.length || 0,
      totalValue: data.totalValue || 0,
      plsBalance: data.plsBalance || 0
    });
    
    // Transform to wallet format
    return {
      address,
      tokens: data.tokens || [],
      totalValue: 0, // Will be calculated after prices are fetched
      tokenCount: data.tokens?.length || 0,
      plsBalance: data.plsBalance || 0,
      plsPriceChange: 0,
      networkCount: 1,
      pricesNeeded: true
    };
  } catch (error) {
    console.error(`Failed to fetch wallet ${address}:`, error);
    return {
      address,
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
      plsBalance: 0,
      plsPriceChange: 0,
      networkCount: 1,
      error: error instanceof Error ? error.message : 'Failed to fetch wallet data'
    };
  }
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
            
            // Skip DexScreener entirely - logos come from server
            // Prices already come from smart contracts via the server
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
 * Fetches wallet data using enhanced scanner (for portfolios)
 * Returns complete token data with LP token analysis
 */
export async function fetchWalletDataFast(address: string): Promise<Wallet> {
  const timer = new PerformanceTimer();
  timer.start(`wallet_service_${address.slice(0, 8)}`, { address });
  
  try {
    // Use fast scanner by default for better reliability
    const walletData = await timer.measure('scanner_balance_fetch', async () => {
      return await fetchWalletBalancesFromScanner(address, 3, true); // Use fast endpoint by default
    }, { address });
    
    // Debug log to see what we're getting
    console.log('Scanner response for', address, ':', {
      hasTokens: !!walletData.tokens,
      isArray: Array.isArray(walletData.tokens),
      tokenCount: walletData.tokens?.length,
      sampleToken: walletData.tokens?.[0]
    });
    
    if (walletData.error) {
      timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
      return walletData;
    }

    // Ensure tokens is an array
    if (!walletData.tokens || !Array.isArray(walletData.tokens)) {
      console.error('Invalid wallet data - tokens is not an array:', walletData);
      timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
      return {
        ...walletData,
        tokens: [],
        totalValue: 0,
        error: 'Invalid wallet data received from scanner'
      };
    }
    
    // Prepare token addresses for batch price fetching
    const tokenAddresses = walletData.tokens.map(token => {
      // For PLS native token, use WPLS price
      if (token.address.toLowerCase() === 'native' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return '0xa1077a294dde1b09bb078844df40758a5d0f9a27'; // WPLS
      }
      return token.address;
    });

    // Add underlying LP token addresses to the price fetch list
    const lpTokenAddresses = new Set<string>();
    walletData.tokens.forEach(token => {
      if (token.isLp) {
        if (token.lpToken0Address) {
          lpTokenAddresses.add(token.lpToken0Address.toLowerCase());
        }
        if (token.lpToken1Address) {
          lpTokenAddresses.add(token.lpToken1Address.toLowerCase());
        }
      }
    });

    // Combine all addresses for price fetching
    const allTokenAddresses = [...tokenAddresses, ...Array.from(lpTokenAddresses)];
    
    // Fetch all prices in batches from smart contracts
    const priceMap = await timer.measure('smart_contract_prices', async () => {
      return await getMultipleTokenPricesFromContract(allTokenAddresses);
    }, { tokenCount: allTokenAddresses.length });
    
    // Apply prices to tokens
    const tokensWithPrices = await timer.measure('apply_prices', async () => {
      return walletData.tokens.map((token, index) => {
        const addressForPrice = tokenAddresses[index];
        const priceData = priceMap.get(addressForPrice.toLowerCase());
        
        // Handle LP tokens specially  
        if (token.isLp) {
          console.log(`🔍 Processing LP token ${token.symbol}:`, {
            isLp: token.isLp,
            lpToken0Address: token.lpToken0Address,
            lpToken1Address: token.lpToken1Address,
            lpToken0BalanceFormatted: token.lpToken0BalanceFormatted,
            lpToken1BalanceFormatted: token.lpToken1BalanceFormatted,
            hasRequiredFields: token.lpToken0BalanceFormatted !== undefined && token.lpToken1BalanceFormatted !== undefined
          });
          
          // Fast scanner detects LP tokens but doesn't calculate underlying balances
          // So ALL LP tokens from fast scanner need client-side analysis
          if (!token.lpToken0BalanceFormatted || !token.lpToken1BalanceFormatted) {
            console.log(`🛠️  LP token ${token.symbol} missing underlying balances - flagging for client-side analysis`);
            token.needsLpAnalysis = true;
          }
        }
        
        if (token.isLp && token.lpToken0BalanceFormatted !== undefined && token.lpToken1BalanceFormatted !== undefined) {
          // Calculate LP token value based on underlying tokens
          let lpValue = 0;
          
          // Get prices for underlying tokens
          const token0Price = token.lpToken0Address ? priceMap.get(token.lpToken0Address.toLowerCase())?.price || 0 : 0;
          const token1Price = token.lpToken1Address ? priceMap.get(token.lpToken1Address.toLowerCase())?.price || 0 : 0;
          
          // Calculate values of underlying tokens
          const token0Value = token.lpToken0BalanceFormatted * token0Price;
          const token1Value = token.lpToken1BalanceFormatted * token1Price;
          
          lpValue = token0Value + token1Value;
          
          // Debug LP token calculation
          console.log(`LP Token ${token.symbol}:`, {
            lpToken0Address: token.lpToken0Address,
            lpToken1Address: token.lpToken1Address,
            lpToken0BalanceFormatted: token.lpToken0BalanceFormatted,
            lpToken1BalanceFormatted: token.lpToken1BalanceFormatted,
            token0Price,
            token1Price,
            token0Value,
            token1Value,
            lpValue
          });
          
          return {
            ...token,
            price: lpValue > 0 && token.balanceFormatted > 0 ? lpValue / token.balanceFormatted : 0,
            value: lpValue,
            lpToken0Price: token0Price,
            lpToken1Price: token1Price,
            lpToken0Value: token0Value,
            lpToken1Value: token1Value,
            priceData: {
              price: lpValue > 0 && token.balanceFormatted > 0 ? lpValue / token.balanceFormatted : 0,
              priceChange24h: 0,
              liquidityUsd: 0,
              volumeUsd24h: 0,
              dexId: 'LP',
              pairAddress: token.address
            }
          };
        }
        
        // Handle regular tokens
        if (priceData) {
          // Calculate value without any cap
          const calculatedValue = token.balanceFormatted * priceData.price;
          
          return {
            ...token,
            price: priceData.price,
            value: calculatedValue,
            priceData
          };
        }
        
        return token;
      });
    }, { tokenCount: walletData.tokens.length });
    
    // Fetch logos from server first
    await timer.measure('fetch_server_logos', async () => {
      try {
        const BATCH_SIZE = 100;
        const addresses = walletData.tokens.map(t => t.address);
        
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
            tokensWithPrices.forEach(token => {
              const logoData = logoMap[token.address.toLowerCase()];
              if (logoData?.logoUrl) {
                token.logo = logoData.logoUrl;
              }
            });
          }
        }
      } catch (error) {
        console.error('Error fetching logos from server:', error);
      }
    }, { tokenCount: walletData.tokens.length });
    
    // Fetch missing logos from DexScreener
    await timer.measure('fetch_dexscreener_logos', async () => {
      const tokensWithoutLogos = tokensWithPrices.filter(token => !token.logo && token.address !== 'native');
      
      if (tokensWithoutLogos.length > 0) {
        console.log(`Fetching logos from DexScreener for ${tokensWithoutLogos.length} tokens`);
        const logoMap = await fetchMultipleTokenLogos(tokensWithoutLogos.map(t => t.address));
        
        // Apply DexScreener logos
        tokensWithoutLogos.forEach(token => {
          const logo = logoMap.get(token.address.toLowerCase());
          if (logo) {
            token.logo = logo;
            // Save to server for future use
            saveLogoToServer(token.address, logo, token.symbol, token.name);
          }
        });
      }
    }, { missingLogos: tokensWithPrices.filter(t => !t.logo && t.address !== 'native').length });
    
    // Process tokens that need LP analysis
    await timer.measure('client_lp_analysis', async () => {
      const tokensNeedingLpAnalysis = tokensWithPrices.filter(token => token.needsLpAnalysis);
      const lpTokens = tokensWithPrices.filter(token => token.isLp);
      
      console.log(`🔍 Debug LP analysis:`, {
        totalTokens: tokensWithPrices.length,
        lpTokensDetected: lpTokens.length,
        tokensNeedingAnalysis: tokensNeedingLpAnalysis.length,
        lpTokenDetails: lpTokens.map(t => ({
          symbol: t.symbol,
          isLp: t.isLp,
          needsLpAnalysis: t.needsLpAnalysis,
          hasBalanceFormatted: !!t.lpToken0BalanceFormatted,
          lpToken0Address: t.lpToken0Address,
          lpToken1Address: t.lpToken1Address
        }))
      });
      
      if (tokensNeedingLpAnalysis.length > 0) {
        console.log(`🔍 Found ${tokensNeedingLpAnalysis.length} LP tokens needing client-side analysis`);
        
        // Process LP tokens in parallel with error handling
        const lpAnalysisPromises = tokensNeedingLpAnalysis.map(async (token, index) => {
          try {
            const analyzedToken = await analyzeLpTokenClientSide(token, priceMap);
            return { index: tokensWithPrices.indexOf(token), analyzedToken };
          } catch (error) {
            console.error(`Failed to analyze LP token ${token.symbol}:`, error);
            // Return the original token with needsLpAnalysis cleared on error
            return { 
              index: tokensWithPrices.indexOf(token), 
              analyzedToken: { ...token, needsLpAnalysis: undefined } 
            };
          }
        });
        
        const analyzedResults = await Promise.allSettled(lpAnalysisPromises);
        
        // Replace tokens with analyzed versions (handle both fulfilled and rejected promises)
        analyzedResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            const { index, analyzedToken } = result.value;
            if (index !== -1) {
              tokensWithPrices[index] = analyzedToken;
            }
          }
        });
        
        console.log(`✅ Completed client-side LP analysis for ${tokensNeedingLpAnalysis.length} tokens`);
      } else if (lpTokens.length > 0) {
        console.log(`⚠️  Found ${lpTokens.length} LP tokens but none were flagged for analysis!`);
      }
    }, { lpTokensAnalyzed: tokensWithPrices.filter(t => t.needsLpAnalysis).length });
    
    // Debug check
    console.log('tokensWithPrices type:', typeof tokensWithPrices, 'isArray:', Array.isArray(tokensWithPrices), 'value:', tokensWithPrices);
    
    // Ensure tokensWithPrices is an array
    const tokensArray = Array.isArray(tokensWithPrices) ? tokensWithPrices : [];
    
    // Recalculate total value
    const totalValue = tokensArray.reduce((sum, token) => sum + (token.value || 0), 0);
    
    timer.end(`wallet_service_${address.slice(0, 8)}`, { 
      success: true,
      tokenCount: tokensArray.length,
      totalValue
    });
    
    return {
      ...walletData,
      tokens: tokensArray,
      totalValue
    };
  } catch (error) {
    timer.end(`wallet_service_${address.slice(0, 8)}`, { error: true });
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
    
    // Step 2: Batch fetch ALL logos from server first (for immediate display)
    const tokensWithPrices: TokenWithPrice[] = [...walletData.tokens];
    const totalTokens = tokensWithPrices.length;
    
    if (onProgress) onProgress('Loading saved token logos...', 20);
    
    // Batch fetch logos for ALL tokens from server
    if (tokensWithPrices.length > 0) {
      try {
        console.log(`Batch loading logos for ${tokensWithPrices.length} tokens from server`);
        const BATCH_SIZE = 100;
        const addresses = tokensWithPrices.map(t => t.address);
        
        for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
          const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
          
          const response = await fetch('/api/token-logos/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: batchAddresses })
          });
          
          if (response.ok) {
            const logoMap = await response.json();
            
            // Apply logos to tokens immediately
            tokensWithPrices.forEach(token => {
              const logoData = logoMap[token.address.toLowerCase()];
              if (logoData?.logoUrl) {
                token.logo = logoData.logoUrl;
              }
            });
          }
        }
      } catch (error) {
        console.error('Failed to batch fetch logos from server:', error);
      }
    }
    
    // Step 2.5: Fetch missing logos from DexScreener
    const tokensWithoutLogos = tokensWithPrices.filter(token => !token.logo && token.address !== 'native');
    if (tokensWithoutLogos.length > 0) {
      if (onProgress) onProgress(`Fetching logos for ${tokensWithoutLogos.length} tokens...`, 30);
      
      try {
        console.log(`Fetching logos from DexScreener for ${tokensWithoutLogos.length} tokens`);
        const logoMap = await fetchMultipleTokenLogos(tokensWithoutLogos.map(t => t.address));
        
        // Apply DexScreener logos
        tokensWithoutLogos.forEach(token => {
          const logo = logoMap.get(token.address.toLowerCase());
          if (logo) {
            token.logo = logo;
            // Save to server for future use
            saveLogoToServer(token.address, logo, token.symbol, token.name);
          }
        });
      } catch (error) {
        console.error('Failed to fetch logos from DexScreener:', error);
      }
    }
    
    // Step 3: Fetch prices from smart contracts
    if (onProgress) onProgress('Reading prices from blockchain...', 40);
    
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
          // Calculate value without any cap
          const calculatedValue = token.balanceFormatted * priceData.price;
          
          token.price = priceData.price;
          token.value = calculatedValue;
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
      const progress = Math.round(50 + (processedCount / totalTokens) * 40); // 50% to 90%
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
 * Processes all tokens, not just top 50
 */
export async function fetchMissingLogosInBackground(tokens: ProcessedToken[]): Promise<void> {
  // Process all tokens, not just top 50
  const tokensWithoutLogos = tokens.filter(t => 
    !t.logo || t.logo === '' || t.logo === null || t.logo.includes('placeholder')
  );
  
  if (tokensWithoutLogos.length === 0) return;
  
  console.log(`Starting background logo fetch for ${tokensWithoutLogos.length} tokens (top 50 by value)`);
  
  try {
    // First, try to get logos from DexScreener for missing logos
    const tokenAddresses = tokensWithoutLogos.map(t => t.address);
    
    // Fetch from DexScreener API (they support batch requests)
    const BATCH_SIZE = 30; // DexScreener can handle larger batches
    
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      const batchAddresses = tokenAddresses.slice(i, i + BATCH_SIZE);
      
      try {
        const addressParam = batchAddresses.join(',');
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/pulsechain/${addressParam}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Update tokens with logos from DexScreener
          if (data.pairs && Array.isArray(data.pairs)) {
            for (const pair of data.pairs) {
              const token = tokensWithoutLogos.find(t => 
                t.address.toLowerCase() === pair.baseToken?.address?.toLowerCase()
              );
              
              if (token && pair.info?.imageUrl) {
                token.logo = pair.info.imageUrl;
                
                // Also save to server for future use
                fetch('/api/token-logos/batch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    addresses: [token.address],
                    logos: { [token.address.toLowerCase()]: pair.info.imageUrl }
                  })
                }).catch(err => console.error('Failed to save logo to server:', err));
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch logos from DexScreener:', error);
      }
      
      // Longer delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Error in background logo fetch:', error);
  }
  
  console.log('Background logo fetch completed');
}

/**
 * Optimized wallet data fetching for portfolios with robust error handling
 * Uses parallel loading with fast endpoint and automatic retry with enhanced endpoint
 */
export async function fetchPortfolioWalletsOptimized(
  addresses: string[],
  onProgress?: (message: string, progress: number) => void
): Promise<Record<string, Wallet>> {
  const timer = new PerformanceTimer();
  timer.start('portfolio_load_optimized', { walletCount: addresses.length });
  
  try {
    const results: Record<string, Wallet> = {};
    
    // Step 1: Try to fetch all wallets in parallel using fast endpoint first
    if (onProgress) onProgress(`Fetching data for ${addresses.length} wallets in parallel...`, 10);
    
    const walletDataPromises = addresses.map(async (address) => {
      try {
        // Try fast endpoint first with shorter timeout
        const walletData = await fetchWalletBalancesFromScanner(address, 2, true); // 2 retries, fast endpoint
        
        if (!walletData.error) {
          console.log(`Successfully loaded ${address} with fast endpoint`);
        }
        
        return { address, data: walletData, success: !walletData.error };
      } catch (error) {
        console.error(`Error fetching wallet ${address}:`, error);
        return { 
          address, 
          data: {
            address,
            tokens: [],
            totalValue: 0,
            tokenCount: 0,
            plsBalance: 0,
            plsPriceChange: 0,
            networkCount: 1,
            error: error instanceof Error ? error.message : 'Failed to fetch wallet'
          },
          success: false 
        };
      }
    });
    
    const firstPassResults = await timer.measure('first_pass_parallel', async () => {
      return await Promise.all(walletDataPromises);
    }, { endpoint: 'fast' });
    
    // Count successful vs failed wallets
    const successfulWallets = firstPassResults.filter(r => r.success);
    const failedWallets = firstPassResults.filter(r => !r.success);
    
    if (failedWallets.length > 0) {
      if (onProgress) onProgress(`Retrying ${failedWallets.length} failed wallets with enhanced scanner...`, 30);
      
      // Step 2: Retry failed wallets with enhanced endpoint in smaller batches
      const retryBatchSize = 3;
      const retryBatches: typeof failedWallets[] = [];
      
      for (let i = 0; i < failedWallets.length; i += retryBatchSize) {
        retryBatches.push(failedWallets.slice(i, i + retryBatchSize));
      }
      
      let retriedCount = 0;
      for (const batch of retryBatches) {
        const retryPromises = batch.map(async ({ address }) => {
          try {
            const walletData = await fetchWalletBalancesFromScanner(address, 2, true); // Use fast endpoint for retries too
            return { address, data: walletData, success: !walletData.error };
          } catch (error) {
            return { 
              address, 
              data: {
                address,
                tokens: [],
                totalValue: 0,
                tokenCount: 0,
                plsBalance: 0,
                networkCount: 1,
                plsPriceChange: 0,
                error: 'Failed after all retries'
              },
              success: false 
            };
          }
        });
        
        const batchResults = await timer.measure(`retry_batch_${retriedCount}`, async () => {
          return await Promise.all(retryPromises);
        }, { batchSize: batch.length });
        
        successfulWallets.push(...batchResults);
        retriedCount += batch.length;
        
        if (onProgress) {
          const progress = 30 + (retriedCount / failedWallets.length) * 20; // 30-50%
          onProgress(`Retried ${retriedCount} of ${failedWallets.length} wallets...`, progress);
        }
      }
    } else {
      // All wallets loaded successfully on first pass
      successfulWallets.push(...firstPassResults);
    }
    
    // Step 3: Collect all unique token addresses from successful wallets
    const uniqueTokenAddresses = new Set<string>();
    const validWallets: Array<{ address: string; data: Wallet }> = [];
    
    for (const { address, data } of successfulWallets) {
      if (data && data.tokens && data.tokens.length > 0) {
        validWallets.push({ address, data });
        data.tokens.forEach((token: ProcessedToken) => {
          if (!token.isNative && !token.price && !token.isLp) {
            uniqueTokenAddresses.add(token.address.toLowerCase());
          }
        });
      } else {
        // Add error wallet to results
        results[address] = {
          address,
          tokens: [],
          totalValue: 0,
          tokenCount: 0,
          plsBalance: undefined,
          plsPriceChange: undefined,
          networkCount: 1,
          error: 'Failed to load wallet data'
        };
      }
    }
    
    if (onProgress) onProgress(`Fetching prices for ${uniqueTokenAddresses.size} unique tokens...`, 30);
    
    // Step 3: Fetch all prices at once
    const tokenAddressArray = Array.from(uniqueTokenAddresses);
    const priceMap = await getMultipleTokenPricesFromContract(tokenAddressArray);
    
    if (onProgress) onProgress(`Applying prices to ${validWallets.length} wallets...`, 70);
    
    // Step 4: Apply prices to all wallets
    for (const { address, data } of validWallets) {
      // Apply prices to tokens
      const tokensWithPrices = data.tokens.map((token: ProcessedToken) => {
        if (token.isNative || token.price || token.isLp) {
          return token;
        }
        
        const priceData = priceMap.get(token.address.toLowerCase());
        if (priceData) {
          const value = token.balanceFormatted * priceData.price;
          return {
            ...token,
            price: priceData.price,
            value,
            priceData: {
              price: priceData.price,
              priceChange24h: 0,
              liquidityUsd: priceData.liquidity,
              volumeUsd24h: 0,
              dexId: 'pulsex',
              pairAddress: priceData.pairAddress,
              logo: token.logo
            }
          };
        }
        return token;
      });
      
      // Calculate total value
      const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Sort by value
      tokensWithPrices.sort((a, b) => (b.value || 0) - (a.value || 0));
      
      results[address] = {
        ...data,
        tokens: tokensWithPrices,
        totalValue
      };
    }
    
    if (onProgress) onProgress('Portfolio loading complete', 100);
    
    return results;
  } catch (error) {
    console.error('Error in optimized portfolio fetch:', error);
    throw error;
  }
}