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
  priceLastChangedAtBlock?: string;
  possibleSpam?: boolean;
  verifiedContract?: boolean;
  pairAddress?: string;
  pairTotalLiquidityUsd?: string;
  securityScore?: number;
  usdPrice24hr?: number;
  usdPrice24hrUsdChange?: number;
  usdPrice24hrPercentChange?: number;
  '24hrPercentChange'?: string;
}

// Moralis Wallet Token Balances Price Response
export interface MoralisWalletTokenBalanceItem {
  token_address: string;
  symbol: string;
  name: string;
  logo?: string;
  thumbnail?: string;
  decimals: string;
  balance: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
  balance_formatted: string;
  usd_price?: number;
  usd_price_24hr_percent_change?: number;
  usd_price_24hr_usd_change?: number;
  usd_value?: number;
  usd_value_24hr_usd_change?: number;
  native_token?: boolean;
  portfolio_percentage?: number;
}

export interface MoralisWalletTokenBalancesResponse {
  cursor: string;
  page: number;
  page_size: number;
  result: MoralisWalletTokenBalanceItem[];
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
  exchange?: string;
  verified?: boolean;
  securityScore?: number;
  isNative?: boolean;
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
