/**
 * Transaction Analyzer Service
 *
 * This service is responsible for extracting detailed information from
 * blockchain transactions using the Moralis SDK.
 */

import Moralis from 'moralis';
import * as moralisService from './moralis';
import { Transaction, TransactionTransfer, SwapDetail } from '../types';

// PulseChain-specific constants
const PULSECHAIN_CHAIN_ID = moralisService.PULSECHAIN_CHAIN_ID;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// Key router addresses on PulseChain (all lowercase)
const KNOWN_ROUTER_ADDRESSES = [
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
];

// Staking and protocol contract addresses
const HEX_CONTRACT_ADDRESS = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

// Method signatures for common transaction types
const METHOD_SIGNATURES = {
  // Swap functions
  SWAP_EXACT_TOKENS_FOR_ETH: '0x7ff36ab5',
  SWAP_EXACT_TOKENS_FOR_TOKENS: '0x38ed1739',
  SWAP_TOKENS_FOR_EXACT_ETH: '0x4a25d94a',
  SWAP_EXACT_ETH_FOR_TOKENS: '0x18cbafe5',
  SWAP_TOKENS_FOR_EXACT_TOKENS: '0x8803dbee',
  SWAP_ETH_FOR_EXACT_TOKENS: '0xfb3bdb41',
  SWAP_TOKENS_FOR_TOKENS_SUPPORTING_FEE: '0x5c11d795',
  
  // Liquidity functions
  ADD_LIQUIDITY: '0xe8e33700',
  ADD_LIQUIDITY_ETH: '0xf305d719',
  ADD_LIQUIDITY_ETH_SUPPORTING_FEE: '0x4515cef3',
  REMOVE_LIQUIDITY: '0xbaa2abde',
  REMOVE_LIQUIDITY_ETH: '0x02751cec',
  REMOVE_LIQUIDITY_ETH_SUPPORTING_FEE: '0xaf2979eb',
  REMOVE_LIQUIDITY_ETH_WITH_PERMIT: '0xded9382a',
  REMOVE_LIQUIDITY_WITH_PERMIT: '0x2195995c',
  
  // HEX staking functions
  HEX_STAKE_START: '0x93fa31f1',
  HEX_STAKE_START_WITH_DAYS: '0xd9a99b82',
  HEX_STAKE_END: '0x835c15c5',
  HEX_STAKE_GOOD_ACCOUNTING: '0x3aa3e5f3',
  HEX_STAKE_EARLY_END: '0x9bdd9b38',
  
  // General staking functions
  STAKE: '0xa694fc3a',
  DEPOSIT: '0xadc9772e',
  DEPOSIT_ALT: '0xe2bbb158',
  WITHDRAW: '0x2e1a7d4d',
  UNSTAKE: '0x853828b6',
  WITHDRAW_ALT: '0x441a3e70',
  
  // Approval functions
  APPROVE: '0x095ea7b3',
  APPROVE_ALL: '0xa22cb465',
  
  // Token transfers
  TRANSFER: '0xa9059cbb',
  TRANSFER_FROM: '0x23b872dd',
};

/**
 * Transaction Type Definitions
 */
export enum TransactionType {
  Unknown = 'unknown',
  Send = 'send',
  Receive = 'receive',
  Swap = 'swap',
  Approval = 'approval',
  LiquidityAdd = 'liquidity_add',
  LiquidityRemove = 'liquidity_remove',
  Stake = 'stake',
  Unstake = 'unstake',
  Contract = 'contract', // Fallback for unclassified contract interactions
}

/**
 * Transaction details interface
 * Contains enhanced information extracted from transaction data
 */
export interface TransactionDetails {
  type: TransactionType;
  methodName: string;
  tokens: {
    sent: TransactionTokenDetail[];
    received: TransactionTokenDetail[];
  };
  protocolName?: string; // e.g., "PulseX", "HEX"
  contractAddress?: string;
  error?: string;
}

/**
 * Token detail in a transaction
 */
export interface TransactionTokenDetail {
  address: string;
  symbol: string;
  name?: string;
  amount: string;
  amountFormatted?: string;
  decimals?: number;
  value?: number; // USD value if available
}

/**
 * Get the base transaction type based on token transfers
 */
export function getBaseTransactionType(
  tx: Transaction, 
  walletAddress: string
): TransactionType {
  walletAddress = walletAddress.toLowerCase();
  
  // Check if this is an approval
  if (tx.input?.startsWith(METHOD_SIGNATURES.APPROVE) || 
      tx.input?.startsWith(METHOD_SIGNATURES.APPROVE_ALL) || 
      tx.method_label?.toLowerCase().includes('approve')) {
    return TransactionType.Approval;
  }
  
  // Check for sent tokens/native currency
  const isSendingERC20 = tx.erc20_transfers?.some(
    (t: TransactionTransfer) => t.from_address?.toLowerCase() === walletAddress
  );
  
  const isSendingNative = tx.from_address?.toLowerCase() === walletAddress && 
                          tx.value !== '0';
  
  // Check for received tokens/native currency
  const isReceivingERC20 = tx.erc20_transfers?.some(
    (t: TransactionTransfer) => t.to_address?.toLowerCase() === walletAddress
  );
  
  const isReceivingNative = tx.to_address?.toLowerCase() === walletAddress && 
                            tx.value !== '0';
  
  // If both sending and receiving, this could be a swap or complex transaction
  if ((isSendingERC20 || isSendingNative) && (isReceivingERC20 || isReceivingNative)) {
    // Will classify the specific type later
    return TransactionType.Unknown;
  }
  
  // Simple send or receive
  if (isSendingERC20 || isSendingNative) {
    return TransactionType.Send;
  }
  
  if (isReceivingERC20 || isReceivingNative) {
    return TransactionType.Receive;
  }
  
  // If we can't determine based on transfers, check contract interactions
  if (tx.to_address && KNOWN_ROUTER_ADDRESSES.includes(tx.to_address.toLowerCase())) {
    // Interacting with a known router but no transfers detected yet
    // Let more specific type detection handle this later
    return TransactionType.Unknown;
  }
  
  // Default for contract interactions with no transfers
  if (tx.from_address?.toLowerCase() === walletAddress && tx.to_address) {
    return TransactionType.Contract;
  }
  
  return TransactionType.Unknown;
}

/**
 * Determine if the transaction is a token swap
 */
export function isSwapTransaction(tx: Transaction): boolean {
  // Check for swap function signatures
  const input = tx.input || '';
  const isSwapMethod = 
    input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_TOKENS_FOR_ETH) || 
    input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_TOKENS_FOR_TOKENS) ||
    input.startsWith(METHOD_SIGNATURES.SWAP_TOKENS_FOR_EXACT_ETH) ||
    input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_ETH_FOR_TOKENS) ||
    input.startsWith(METHOD_SIGNATURES.SWAP_TOKENS_FOR_EXACT_TOKENS) ||
    input.startsWith(METHOD_SIGNATURES.SWAP_ETH_FOR_EXACT_TOKENS) ||
    input.startsWith(METHOD_SIGNATURES.SWAP_TOKENS_FOR_TOKENS_SUPPORTING_FEE);
    
  // Check if interacting with a known router
  const isRouterInteraction = tx.to_address ? 
    KNOWN_ROUTER_ADDRESSES.includes(tx.to_address.toLowerCase()) : false;
    
  return isSwapMethod || isRouterInteraction;
}

/**
 * Determine if the transaction is a liquidity operation
 */
export function isLiquidityOperation(tx: Transaction): boolean {
  const input = tx.input || '';
  
  // Check for liquidity function signatures
  const isAddLiquidity = 
    input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY) ||
    input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY_ETH) ||
    input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY_ETH_SUPPORTING_FEE);
    
  const isRemoveLiquidity = 
    input.startsWith(METHOD_SIGNATURES.REMOVE_LIQUIDITY) ||
    input.startsWith(METHOD_SIGNATURES.REMOVE_LIQUIDITY_ETH) ||
    input.startsWith(METHOD_SIGNATURES.REMOVE_LIQUIDITY_ETH_SUPPORTING_FEE) ||
    input.startsWith(METHOD_SIGNATURES.REMOVE_LIQUIDITY_ETH_WITH_PERMIT) ||
    input.startsWith(METHOD_SIGNATURES.REMOVE_LIQUIDITY_WITH_PERMIT);
    
  return isAddLiquidity || isRemoveLiquidity;
}

/**
 * Determine if the transaction is a staking operation
 */
export function isStakingOperation(tx: Transaction): boolean {
  const input = tx.input || '';
  const toAddress = tx.to_address?.toLowerCase() || '';
  
  // Check for HEX specific staking
  const isHexContract = toAddress === HEX_CONTRACT_ADDRESS.toLowerCase();
  
  const isHexStaking = isHexContract && (
    input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START) ||
    input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START_WITH_DAYS)
  );
  
  const isHexUnstaking = isHexContract && (
    input.startsWith(METHOD_SIGNATURES.HEX_STAKE_END) ||
    input.startsWith(METHOD_SIGNATURES.HEX_STAKE_GOOD_ACCOUNTING) ||
    input.startsWith(METHOD_SIGNATURES.HEX_STAKE_EARLY_END)
  );
  
  // Check for general staking operations
  const isGenericStaking = 
    input.startsWith(METHOD_SIGNATURES.STAKE) ||
    input.startsWith(METHOD_SIGNATURES.DEPOSIT) ||
    input.startsWith(METHOD_SIGNATURES.DEPOSIT_ALT);
    
  const isGenericUnstaking = 
    input.startsWith(METHOD_SIGNATURES.WITHDRAW) ||
    input.startsWith(METHOD_SIGNATURES.UNSTAKE) ||
    input.startsWith(METHOD_SIGNATURES.WITHDRAW_ALT);
    
  return isHexStaking || isHexUnstaking || isGenericStaking || isGenericUnstaking;
}

/**
 * Format a token amount based on decimals
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  try {
    // Handle different decimal precision
    const rawValue = BigInt(amount);
    return (Number(rawValue) / Math.pow(10, decimals)).toFixed(6);
  } catch (error) {
    console.error('Error formatting token amount:', error);
    return '0';
  }
}

/**
 * Extract token transfer information from a transaction
 */
export async function extractTokenTransfers(
  tx: Transaction, 
  walletAddress: string
): Promise<{ sent: TransactionTokenDetail[], received: TransactionTokenDetail[] }> {
  const sent: TransactionTokenDetail[] = [];
  const received: TransactionTokenDetail[] = [];
  
  walletAddress = walletAddress.toLowerCase();
  
  // Process ERC20 transfers
  if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
    for (const transfer of tx.erc20_transfers) {
      const fromAddress = transfer.from_address?.toLowerCase();
      const toAddress = transfer.to_address?.toLowerCase();
      const tokenAddress = transfer.address?.toLowerCase() || '';
      
      // Skip undefined or empty addresses
      if (!fromAddress || !toAddress || !tokenAddress) continue;
      
      // Get token metadata if symbol/name is missing
      let symbol = transfer.token_symbol || '';
      let name = transfer.token_name || '';
      let decimals = transfer.token_decimals ? parseInt(transfer.token_decimals) : 18;
      
      if (!symbol || !name) {
        try {
          const tokenMetadata = await moralisService.getTokenMetadata(tokenAddress);
          if (tokenMetadata) {
            symbol = symbol || tokenMetadata.symbol;
            name = name || tokenMetadata.name;
            decimals = decimals || parseInt(tokenMetadata.decimals);
          }
        } catch (error) {
          console.error(`Error fetching token metadata for ${tokenAddress}:`, error);
        }
      }
      
      // Format the value
      const amountFormatted = formatTokenAmount(transfer.value || '0', decimals);
      
      // Categorize as sent or received
      if (fromAddress === walletAddress) {
        sent.push({
          address: tokenAddress,
          symbol: symbol || 'Unknown Token',
          name: name,
          amount: transfer.value || '0',
          amountFormatted,
          decimals
        });
      }
      
      if (toAddress === walletAddress) {
        received.push({
          address: tokenAddress,
          symbol: symbol || 'Unknown Token',
          name: name,
          amount: transfer.value || '0',
          amountFormatted,
          decimals
        });
      }
    }
  }
  
  // Process native token (PLS) transfers
  if (tx.value && tx.value !== '0') {
    const fromAddress = tx.from_address?.toLowerCase();
    const toAddress = tx.to_address?.toLowerCase();
    
    const amountFormatted = formatTokenAmount(tx.value, 18);
    
    if (fromAddress === walletAddress && toAddress !== walletAddress) {
      sent.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        amount: tx.value,
        amountFormatted,
        decimals: 18
      });
    }
    
    if (toAddress === walletAddress && fromAddress !== walletAddress) {
      received.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        amount: tx.value,
        amountFormatted,
        decimals: 18
      });
    }
  }
  
  return { sent, received };
}

/**
 * Determine the protocol name based on the contract address
 */
export function getProtocolName(contractAddress: string): string {
  const address = contractAddress.toLowerCase();
  
  // DEX routers
  if (address === '0x165c68077ac06c83800d19200e6e2b08d02de75c' || 
      address === '0x98bf93ebf5c380c0e6daeda0b0e9894a57779dfb') {
    return 'PulseX';
  }
  
  if (address === '0xda9aba4eacf54e0273f56dffee6b8f1e20b23bba') {
    return 'Velocity';
  }
  
  if (address === '0xb4959bebfc2919da68119ac8efa1b57382e69089') {
    return 'PLDEX';
  }
  
  if (address === '0xc145990e84155416144c532e31642d04dbd5a14a') {
    return 'ThorSwap';
  }
  
  // Staking protocols
  if (address === '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39') {
    return 'HEX';
  }
  
  if (address === '0x075dbb8b2ea6929ee58d552b5b2e5510b08ef028') {
    return 'PulseX IFO/MAXIMUS';
  }
  
  return 'Unknown Protocol';
}

/**
 * Get a appropriate method name based on transaction type and signature
 */
export function getMethodName(tx: Transaction, type: TransactionType): string {
  const input = tx.input || '';
  
  // If we already have a method label from the API, use it
  if (tx.method_label && !tx.method_label.includes('unknown')) {
    return tx.method_label;
  }
  
  // Swap methods
  if (type === TransactionType.Swap) {
    if (input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_TOKENS_FOR_ETH)) {
      return 'Swap Exact Tokens For PLS';
    }
    if (input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_TOKENS_FOR_TOKENS)) {
      return 'Swap Exact Tokens For Tokens';
    }
    if (input.startsWith(METHOD_SIGNATURES.SWAP_TOKENS_FOR_EXACT_ETH)) {
      return 'Swap Tokens For Exact PLS';
    }
    if (input.startsWith(METHOD_SIGNATURES.SWAP_EXACT_ETH_FOR_TOKENS)) {
      return 'Swap Exact PLS For Tokens';
    }
    if (input.startsWith(METHOD_SIGNATURES.SWAP_TOKENS_FOR_EXACT_TOKENS)) {
      return 'Swap Tokens For Exact Tokens';
    }
    if (input.startsWith(METHOD_SIGNATURES.SWAP_ETH_FOR_EXACT_TOKENS)) {
      return 'Swap PLS For Exact Tokens';
    }
    return 'Swap';
  }
  
  // Liquidity methods
  if (type === TransactionType.LiquidityAdd) {
    return 'Add Liquidity';
  }
  
  if (type === TransactionType.LiquidityRemove) {
    return 'Remove Liquidity';
  }
  
  // Staking methods
  if (type === TransactionType.Stake) {
    // HEX specific
    if (tx.to_address?.toLowerCase() === HEX_CONTRACT_ADDRESS.toLowerCase()) {
      if (input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START) || 
          input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START_WITH_DAYS)) {
        return 'Start HEX Stake';
      }
    }
    return 'Stake';
  }
  
  if (type === TransactionType.Unstake) {
    // HEX specific
    if (tx.to_address?.toLowerCase() === HEX_CONTRACT_ADDRESS.toLowerCase()) {
      if (input.startsWith(METHOD_SIGNATURES.HEX_STAKE_END)) {
        return 'End HEX Stake';
      }
      if (input.startsWith(METHOD_SIGNATURES.HEX_STAKE_EARLY_END)) {
        return 'Early End HEX Stake';
      }
      if (input.startsWith(METHOD_SIGNATURES.HEX_STAKE_GOOD_ACCOUNTING)) {
        return 'HEX Good Accounting';
      }
    }
    return 'Unstake';
  }
  
  // Approval methods
  if (type === TransactionType.Approval) {
    return 'Approve';
  }
  
  // Basic send and receive methods
  if (type === TransactionType.Send) {
    return 'Send';
  }
  
  if (type === TransactionType.Receive) {
    return 'Receive';
  }
  
  // Fallback for unknown contract interactions
  return 'Contract Interaction';
}

/**
 * Get USD value for a token if possible
 * @param tokenAddress The token contract address
 * @param amount The token amount (formatted)
 * @returns The USD value if price is available, or undefined
 */
async function getTokenUSDValue(tokenAddress: string, amount: string): Promise<number | undefined> {
  try {
    // Get token price from Moralis
    const priceData = await moralisService.getTokenPrice(tokenAddress);
    if (priceData && priceData.usdPrice) {
      // Calculate value
      const usdValue = parseFloat(amount) * priceData.usdPrice;
      return usdValue;
    }
  } catch (error) {
    console.error(`Error getting USD value for token ${tokenAddress}:`, error);
  }
  return undefined;
}

/**
 * Get detailed information for a transaction
 */
export async function analyzeTransaction(
  tx: Transaction, 
  walletAddress: string
): Promise<TransactionDetails> {
  try {
    walletAddress = walletAddress.toLowerCase();
    
    // First get the base transaction type
    let type = getBaseTransactionType(tx, walletAddress);
    
    // Extract token transfers
    const { sent, received } = await extractTokenTransfers(tx, walletAddress);
    
    // Enhance token information with USD values where possible
    for (const token of [...sent, ...received]) {
      try {
        if (token.amountFormatted) {
          const usdValue = await getTokenUSDValue(token.address, token.amountFormatted);
          if (usdValue !== undefined) {
            token.value = usdValue;
          }
        }
      } catch (error) {
        console.error(`Error enhancing token value for ${token.symbol}:`, error);
      }
    }
    
    // For unknown types, try to classify based on more specific criteria
    if (type === TransactionType.Unknown || type === TransactionType.Contract) {
      if (isSwapTransaction(tx) && sent.length > 0 && received.length > 0) {
        type = TransactionType.Swap;
      } else if (isLiquidityOperation(tx)) {
        // Differentiate between adding and removing liquidity
        const input = tx.input || '';
        const isAddLiquidity = 
          input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY) ||
          input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY_ETH) ||
          input.startsWith(METHOD_SIGNATURES.ADD_LIQUIDITY_ETH_SUPPORTING_FEE);
          
        type = isAddLiquidity ? TransactionType.LiquidityAdd : TransactionType.LiquidityRemove;
      } else if (isStakingOperation(tx)) {
        // Differentiate between staking and unstaking
        const input = tx.input || '';
        const isHexContract = tx.to_address?.toLowerCase() === HEX_CONTRACT_ADDRESS.toLowerCase();
        
        const isStake = 
          input.startsWith(METHOD_SIGNATURES.STAKE) ||
          input.startsWith(METHOD_SIGNATURES.DEPOSIT) ||
          input.startsWith(METHOD_SIGNATURES.DEPOSIT_ALT) ||
          (isHexContract && (
            input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START) ||
            input.startsWith(METHOD_SIGNATURES.HEX_STAKE_START_WITH_DAYS)
          ));
          
        type = isStake ? TransactionType.Stake : TransactionType.Unstake;
      }
    }
    
    // Get method name and protocol
    const methodName = getMethodName(tx, type);
    const protocolName = tx.to_address ? getProtocolName(tx.to_address) : undefined;
    
    // Build the detailed transaction info
    const details: TransactionDetails = {
      type,
      methodName,
      tokens: { sent, received },
      protocolName,
      contractAddress: tx.to_address,
    };
    
    // For swaps, generate a more descriptive method name with token amounts
    if (type === TransactionType.Swap && sent.length > 0 && received.length > 0) {
      const outToken = sent[0];
      const inToken = received[0];
      
      details.methodName = `Swap ${outToken.amountFormatted} ${outToken.symbol} for ${inToken.amountFormatted} ${inToken.symbol}`;
    }
    
    return details;
  } catch (error) {
    console.error('Error analyzing transaction:', error);
    return {
      type: TransactionType.Unknown,
      methodName: 'Unknown Transaction',
      tokens: { sent: [], received: [] },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Analyze a batch of transactions
 */
export async function analyzeTransactions(
  transactions: Transaction[],
  walletAddress: string
): Promise<{ [txHash: string]: TransactionDetails }> {
  const results: { [txHash: string]: TransactionDetails } = {};
  
  for (const tx of transactions) {
    results[tx.hash] = await analyzeTransaction(tx, walletAddress);
  }
  
  return results;
}