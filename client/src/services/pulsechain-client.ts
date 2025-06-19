/**
 * Client-side PulseChain API service
 * Calls PulseChain Scan directly from the browser to avoid server load
 */

interface PulseChainTokenBalance {
  token: {
    address: string;
    name: string;
    symbol: string;
    type: string;
    decimals: string;
    holders: string;
    exchange_rate: string | null;
    icon_url: string | null;
  };
  value: string;
  token_id?: string | null;
  token_instance?: any | null;
}

interface PulseChainAddressResponse {
  address: string;
  coin_balance: string; // Native PLS balance in wei
  creator_address?: string | null;
  implementation_address?: string | null;
  implementation_name?: string | null;
  name?: string | null;
  is_contract: boolean;
  is_verified: boolean;
  private_tags?: string[];
  public_tags?: string[];
  watchlist_names?: string[];
  tx_count: number;
  created_at?: string;
}

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
}

interface WalletData {
  address: string;
  tokens: ProcessedToken[];
  totalValue: number;
  tokenCount: number;
  plsBalance: number | null;
  plsPriceChange: number | null;
  networkCount: number;
  pagination?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

const BASE_URL = 'https://scan.pulsechain.com/api/v2';

export async function getWalletTokenBalances(walletAddress: string): Promise<WalletData | null> {

  try {
    // Fetch wallet info (including native PLS balance)
    const addressResponse = await fetch(`${BASE_URL}/addresses/${walletAddress}`);
    if (!addressResponse.ok) {
      console.error(`PulseChain address API error: ${addressResponse.status}`);
      return null;
    }
    
    const addressData: PulseChainAddressResponse = await addressResponse.json();
    
    // Fetch token balances
    const tokensResponse = await fetch(`${BASE_URL}/addresses/${walletAddress}/tokens?type=ERC-20`);
    if (!tokensResponse.ok) {
      console.error(`PulseChain tokens API error: ${tokensResponse.status}`);
      return null;
    }
    
    const tokensData: { items: PulseChainTokenBalance[] } = await tokensResponse.json();
    
    // Process tokens
    const tokens: ProcessedToken[] = [];
    
    // Add native PLS token
    const plsBalance = parseFloat(addressData.coin_balance) / 1e18;
    if (plsBalance > 0) {
      tokens.push({
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: 18,
        balance: addressData.coin_balance,
        balanceFormatted: plsBalance,
        isNative: true,
        verified: true,
        logo: 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png'
      });
    }
    
    // Add ERC-20 tokens
    for (const tokenData of tokensData.items || []) {
      const decimals = parseInt(tokenData.token.decimals);
      const balance = parseFloat(tokenData.value);
      const balanceFormatted = balance / Math.pow(10, decimals);
      
      if (balanceFormatted > 0) {
        tokens.push({
          address: tokenData.token.address,
          symbol: tokenData.token.symbol,
          name: tokenData.token.name,
          decimals,
          balance: tokenData.value,
          balanceFormatted,
          logo: tokenData.token.icon_url || undefined,
          verified: false,
          isNative: false
        });
      }
    }
    
    const result: WalletData = {
      address: walletAddress,
      tokens,
      totalValue: 0, // Will be calculated after price fetching
      tokenCount: tokens.length,
      plsBalance,
      plsPriceChange: null,
      networkCount: 1
    };
    
    return result;
  } catch (error) {
    console.error(`Error fetching wallet data from PulseChain for ${walletAddress}:`, error);
    return null;
  }
}

export async function getWalletTransactions(
  walletAddress: string, 
  page: number = 1, 
  limit: number = 50
) {
  try {
    const response = await fetch(
      `${BASE_URL}/addresses/${walletAddress}/transactions?page=${page}&limit=${limit}`
    );
    
    if (!response.ok) {
      console.error(`PulseChain transactions API error: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching transactions from PulseChain for ${walletAddress}:`, error);
    return null;
  }
}