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
  tokenName: string;
  tokenSymbol: string;
  tokenLogo?: string;
  tokenDecimals: string;
  nativePrice: {
    value: string;
    decimals: number;
    name: string;
    symbol: string;
    address: string;
  };
  usdPrice: number;
  usdPriceFormatted: string;
  exchangeName: string;
  exchangeAddress: string;
  tokenAddress: string;
  blockTimestamp: string;
  usdPrice24hr?: number;
  usdPrice24hrPercentChange?: number;
  '24hrPercentChange'?: string;
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
