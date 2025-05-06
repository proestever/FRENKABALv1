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

export interface PulseChainAddressResponse {
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
  isLp?: boolean;
  lpToken0Symbol?: string;
  lpToken1Symbol?: string;
  lpToken0Address?: string;
  lpToken1Address?: string;
  lpToken0Decimals?: number;
  lpToken1Decimals?: number;
  lpToken0Balance?: string;
  lpToken1Balance?: string;
  lpToken0BalanceFormatted?: number;
  lpToken1BalanceFormatted?: number;
  lpToken0Price?: number;
  lpToken1Price?: number;
  lpToken0Value?: number;
  lpToken1Value?: number;
  lpTotalSupply?: string;
  lpReserve0?: string;
  lpReserve1?: string;
}

export interface WalletData {
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

// Transaction history types
export interface TransactionTransfer {
  token_name?: string;
  token_symbol?: string;
  token_logo?: string | null;
  token_decimals?: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  address?: string;
  log_index?: number;
  value: string;
  value_formatted?: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
  security_score?: number;
  direction?: string;
  internal_transaction?: boolean;
}

export interface Transaction {
  hash: string;
  nonce: string;
  transaction_index: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  value: string;
  gas: string;
  gas_price: string;
  receipt_gas_used: string;
  receipt_status: string;
  block_timestamp: string;
  block_number: string;
  transaction_fee: string;
  method_label?: string;
  erc20_transfers?: TransactionTransfer[];
  native_transfers?: TransactionTransfer[];
  nft_transfers?: any[];
  summary?: string;
  category?: string;
  possible_spam?: boolean;
}
