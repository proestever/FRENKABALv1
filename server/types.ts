// PulseChain Scan API response types
// The API returns an array of token balances directly, not wrapped in an items property
export type PulseChainTokenBalanceResponse = PulseChainTokenBalance[];

export interface PulseChainTokenBalance {
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

// Moralis API response types
export interface MoralisTokenPriceResponse {
  tokenAddress: string;
  usdPrice: number;
  nativePrice: {
    value: string;
    decimals: number;
    name: string;
    symbol: string;
  };
  exchangeAddress: string;
  exchangeName: string;
  priceChange: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
}

// Combined wallet data types
export interface ProcessedToken {
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
}

export interface WalletData {
  address: string;
  tokens: ProcessedToken[];
  totalValue: number;
  tokenCount: number;
  plsBalance: number | null;
  plsPriceChange: number | null;
  networkCount: number;
}
