import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getTokenPriceFromDexScreener, getDexScreenerTokenData } from './dexscreener';
import { storage } from '../storage';

// Initialize provider with correct RPC
const provider = new ethers.providers.JsonRpcProvider('https://rpc.pulsechain.com');

// Constants
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// Standard ERC20 ABI
const ERC20_ABI = [
  {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}
];

/**
 * Get token balance and basic info FAST - no price lookups
 */
async function getQuickTokenInfo(tokenAddress: string, walletAddress: string): Promise<ProcessedToken | null> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get basic info only - no prices
    const [decimals, symbol, name, balance] = await Promise.all([
      contract.decimals().catch(() => 18),
      contract.symbol().catch(() => 'UNKNOWN'),
      contract.name().catch(() => 'Unknown Token'),
      contract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
    ]);
    
    const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, decimals));
    
    // Skip if balance is zero
    if (balanceFormatted < 0.000001) {
      return null;
    }
    
    return {
      address: tokenAddress,
      symbol,
      name,
      decimals,
      balance: balance.toString(),
      balanceFormatted,
      price: undefined, // Will load later
      value: undefined,
      priceChange24h: undefined,
      logo: undefined, // Will load later
      verified: false,
      isNative: false
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get wallet balances FAST - returns immediately with basic data
 */
export async function getProgressiveBalances(walletAddress: string): Promise<ProcessedToken[]> {
  const startTime = Date.now();
  console.log(`Starting FAST progressive balance fetch for ${walletAddress}`);
  
  try {
    // 1. Get PLS balance immediately
    const plsBalance = await provider.getBalance(walletAddress);
    const plsBalanceFormatted = parseFloat(ethers.utils.formatEther(plsBalance));
    
    const tokens: ProcessedToken[] = [];
    
    // Add PLS if has balance
    if (plsBalanceFormatted > 0.000001) {
      tokens.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: plsBalance.toString(),
        balanceFormatted: plsBalanceFormatted,
        price: undefined, // Will load later
        value: undefined,
        priceChange24h: undefined,
        logo: '/assets/pls-logo-trimmed.png',
        verified: true,
        isNative: true
      });
    }
    
    // 2. Get recent token transfers (last 10k blocks only for speed)
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Only recent activity
    
    // Get transfer events
    const [incomingLogs, outgoingLogs] = await Promise.all([
      provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        topics: [TRANSFER_EVENT_TOPIC, null, ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32)]
      }),
      provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        topics: [TRANSFER_EVENT_TOPIC, ethers.utils.hexZeroPad(walletAddress.toLowerCase(), 32), null]
      })
    ]);
    
    // Extract unique token addresses
    const tokenAddresses = new Set<string>();
    [...incomingLogs, ...outgoingLogs].forEach(log => {
      tokenAddresses.add(log.address.toLowerCase());
    });
    
    console.log(`Found ${tokenAddresses.size} tokens from recent activity in ${Date.now() - startTime}ms`);
    
    // 3. Get basic token info in batches (no prices yet)
    const batchSize = 10;
    const tokenArray = Array.from(tokenAddresses);
    
    for (let i = 0; i < tokenArray.length; i += batchSize) {
      const batch = tokenArray.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(addr => getQuickTokenInfo(addr, walletAddress))
      );
      
      batchResults.forEach(token => {
        if (token) tokens.push(token);
      });
    }
    
    console.log(`Progressive balance fetch complete in ${Date.now() - startTime}ms - found ${tokens.length} tokens`);
    return tokens;
  } catch (error) {
    console.error('Error in progressive balance fetch:', error);
    throw error;
  }
}

/**
 * Enhanced logo fetching that properly checks DexScreener
 */
export async function fetchTokenLogoFromDexScreener(tokenAddress: string): Promise<string | null> {
  try {
    console.log(`Fetching enhanced logo for ${tokenAddress} from DexScreener`);
    
    // First check database
    const existingLogo = await storage.getTokenLogo(tokenAddress);
    if (existingLogo && existingLogo.logoUrl && existingLogo.logoUrl !== '/assets/100xfrenlogo.png') {
      return existingLogo.logoUrl;
    }
    
    // Fetch from DexScreener
    const dexData = await getDexScreenerTokenData(tokenAddress);
    
    if (dexData && dexData.pairs && dexData.pairs.length > 0) {
      // Find the token in pairs
      for (const pair of dexData.pairs) {
        const tokenInfo = pair.baseToken.address.toLowerCase() === tokenAddress.toLowerCase() 
          ? pair.baseToken 
          : pair.quoteToken.address.toLowerCase() === tokenAddress.toLowerCase()
            ? pair.quoteToken
            : null;
        
        if (tokenInfo) {
          // Check for logo in token info
          let logoUrl = null;
          
          // Try different logo fields from DexScreener
          if (tokenInfo.info?.imageUrl) {
            logoUrl = tokenInfo.info.imageUrl;
          } else if (tokenInfo.info?.websites && tokenInfo.info.websites.length > 0) {
            // Sometimes logo is in websites array
            const logoSite = tokenInfo.info.websites.find((w: any) => 
              w.label?.toLowerCase().includes('logo') || 
              w.url?.includes('logo') ||
              w.url?.endsWith('.png') ||
              w.url?.endsWith('.jpg')
            );
            if (logoSite) logoUrl = logoSite.url;
          }
          
          // Fallback to PulseX token images
          if (!logoUrl) {
            logoUrl = `https://tokens.app.pulsex.com/images/tokens/${tokenAddress}.png`;
          }
          
          // Save to database
          if (logoUrl) {
            await storage.saveTokenLogo({
              tokenAddress,
              logoUrl,
              symbol: tokenInfo.symbol || '',
              name: tokenInfo.name || '',
              lastUpdated: new Date().toISOString()
            });
            
            console.log(`Found DexScreener logo for ${tokenInfo.symbol}: ${logoUrl}`);
            return logoUrl;
          }
        }
      }
    }
    
    // Try PulseX as last resort
    const pulseXLogo = `https://tokens.app.pulsex.com/images/tokens/${tokenAddress}.png`;
    await storage.saveTokenLogo({
      tokenAddress,
      logoUrl: pulseXLogo,
      symbol: '',
      name: '',
      lastUpdated: new Date().toISOString()
    });
    
    return pulseXLogo;
  } catch (error) {
    console.error(`Error fetching logo for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fetch price and logo data for a token
 */
export async function enrichTokenData(token: ProcessedToken): Promise<ProcessedToken> {
  try {
    // Fetch price data and logo in parallel
    const [priceData, logo] = await Promise.all([
      getDexScreenerTokenData(token.address),
      fetchTokenLogoFromDexScreener(token.address)
    ]);
    
    // Extract price from DexScreener data
    let price: number | undefined;
    let priceChange24h: number | undefined;
    let verified = false;
    
    if (priceData && priceData.pairs && priceData.pairs.length > 0) {
      // Find best pair (highest liquidity WPLS pair)
      const wplsPairs = priceData.pairs.filter((p: any) => 
        p.quoteToken.symbol === 'WPLS' || p.baseToken.symbol === 'WPLS'
      );
      const bestPair = wplsPairs[0] || priceData.pairs[0];
      
      if (bestPair) {
        price = parseFloat(bestPair.priceUsd);
        priceChange24h = bestPair.priceChange?.h24 || undefined;
        verified = bestPair.baseToken.address.toLowerCase() === token.address.toLowerCase()
          ? true // Assume verified if found on DexScreener
          : false;
      }
    }
    
    return {
      ...token,
      price,
      value: price ? token.balanceFormatted * price : undefined,
      priceChange24h,
      logo: logo || token.logo,
      verified
    };
  } catch (error) {
    console.error(`Error enriching token ${token.symbol}:`, error);
    return token;
  }
}