/**
 * Scanner Transaction Service
 * Uses PulseChain Scan API for efficient transaction history fetching
 * with recent block scanning for real-time updates
 */

import { ethers } from 'ethers';
import { Transaction, TransactionTransfer } from '../types';
import { getProvider } from './rpc-provider';
import { executeWithFailover } from './rpc-provider';

const PULSECHAIN_SCAN_API_BASE = 'https://api.scan.pulsechain.com/api/v2';
const RECENT_BLOCKS_TO_SCAN = 100; // Last ~30 minutes of blocks
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

/**
 * Get token metadata (name, symbol, decimals) from contract
 */
async function getTokenMetadata(tokenAddress: string): Promise<{decimals: number, symbol: string, name: string} | null> {
  try {
    const contract = await executeWithFailover(async (provider) => {
      return new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    });
    
    // Try to get all metadata in parallel
    const [decimals, symbol, name] = await Promise.all([
      contract.decimals().catch(() => 18), // Default to 18 if fails
      contract.symbol().catch(() => 'UNKNOWN'),
      contract.name().catch(() => 'Unknown Token')
    ]);

    return { decimals, symbol, name };
  } catch (error) {
    console.error(`Error fetching metadata for token ${tokenAddress}:`, error);
    return null;
  }
}

interface ScannerTransaction {
  hash: string;
  from: {
    hash: string;
    name?: string;
    is_contract?: boolean;
  };
  to: {
    hash: string;
    name?: string;
    is_contract?: boolean;
  };
  value: string;
  fee: {
    value: string;
  };
  gas_used: string;
  gas_price: string;
  block: number;
  timestamp: string;
  method?: string;
  status: string;
  result?: string;
  token_transfers?: Array<{
    from: {
      hash: string;
      name?: string;
    };
    to: {
      hash: string;
      name?: string;
    };
    token: {
      address: string;
      symbol: string;
      name: string;
      decimals?: string;
    };
    total: {
      value: string;
      decimals?: number;
    };
  }>;
}

/**
 * Fetch transaction history from PulseChain Scan API
 */
async function fetchTransactionsFromScanner(
  walletAddress: string,
  limit: number = 100,
  cursor?: string
): Promise<{ transactions: Transaction[]; nextCursor?: string }> {
  try {
    console.log(`Fetching transaction history from PulseChain Scan for ${walletAddress}`);
    
    let url = `${PULSECHAIN_SCAN_API_BASE}/addresses/${walletAddress}/transactions?filter=to%20%7C%20from&limit=${limit}`;
    if (cursor) {
      url += `&cursor=${cursor}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Scanner API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const items = data.items || [];
    
    // Convert scanner format to our Transaction format
    const transactions: Transaction[] = await Promise.all(
      items.map(async (item: ScannerTransaction) => {
        try {
          // Skip if essential fields are missing
          if (!item || !item.hash) {
            return null;
          }
          
          // Create basic transaction with fallback values
          const tx: Transaction = {
            hash: item.hash,
            nonce: '0', // Not provided by scanner API
            transaction_index: '0', // Not provided by scanner API
            from_address: item.from?.hash || '0x0000000000000000000000000000000000000000',
            from_address_label: item.from?.name || null,
            to_address: item.to?.hash || '0x0000000000000000000000000000000000000000', // Contract creation
            to_address_label: item.to?.name || null,
            value: item.value || '0',
            gas: item.gas_used || '0',
            gas_price: item.gas_price || '0',
            receipt_gas_used: item.gas_used || '0',
            receipt_status: item.status === 'ok' ? '1' : '0',
            block_timestamp: item.timestamp || new Date().toISOString(),
            block_number: item.block ? item.block.toString() : '0',
            transaction_fee: item.fee?.value || '0',
            method_label: item.method || 'Transaction',
            erc20_transfers: [],
            native_transfers: []
          };
        
        // Process token transfers
        if (item.token_transfers) {
          for (const transfer of item.token_transfers) {
            // Skip if transfer is missing essential data
            if (!transfer || !transfer.token || !transfer.from || !transfer.to) {
              continue;
            }
            
            // Determine transfer direction relative to the wallet
            const direction = transfer.from.hash.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 
                            transfer.to.hash.toLowerCase() === walletAddress.toLowerCase() ? 'receive' : 
                            'internal';
            
            const tokenTransfer: TransactionTransfer = {
              token_name: transfer.token.name || 'Unknown',
              token_symbol: transfer.token.symbol || 'UNKNOWN',
              token_decimals: transfer.token.decimals || '18',
              from_address: transfer.from.hash,
              from_address_label: transfer.from.name || null,
              to_address: transfer.to.hash,
              to_address_label: transfer.to.name || null,
              address: transfer.token.address,
              value: transfer.total ? transfer.total.value : '0',
              value_formatted: ethers.utils.formatUnits(
                transfer.total ? transfer.total.value : '0',
                parseInt(transfer.token.decimals || '18')
              ),
              direction: direction as 'send' | 'receive' | 'internal'
            };
            
            tx.erc20_transfers!.push(tokenTransfer);
          }
        }
        
        return tx;
        } catch (error) {
          console.error(`Error parsing transaction ${item?.hash || 'unknown'}:`, error);
          // Return a basic transaction even if parsing fails
          return {
            hash: item?.hash || `error-${Date.now()}`,
            nonce: '0',
            transaction_index: '0',
            from_address: item?.from?.hash || '0x0000000000000000000000000000000000000000',
            from_address_label: null,
            to_address: item?.to?.hash || '0x0000000000000000000000000000000000000000',
            to_address_label: null,
            value: '0',
            gas: '0',
            gas_price: '0',
            receipt_gas_used: '0',
            receipt_status: '0',
            block_timestamp: new Date().toISOString(),
            block_number: '0',
            transaction_fee: '0',
            method_label: 'Unknown Transaction',
            erc20_transfers: [],
            native_transfers: []
          };
        }
      })
    );
    
    // Filter out null transactions
    const validTransactions = transactions.filter(tx => tx !== null) as Transaction[];
    
    console.log(`Fetched ${validTransactions.length} transactions from scanner`);
    
    return {
      transactions: validTransactions,
      nextCursor: data.next_page_params?.cursor
    };
  } catch (error) {
    console.error('Error fetching transactions from scanner:', error);
    throw error;
  }
}

/**
 * Scan recent blocks for any new transactions
 */
async function scanRecentTransactions(
  walletAddress: string,
  blocksToScan: number = RECENT_BLOCKS_TO_SCAN
): Promise<Transaction[]> {
  try {
    console.log(`Scanning last ${blocksToScan} blocks for recent transactions`);
    
    const provider = getProvider();
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - blocksToScan);
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Get all transactions in recent blocks that involve this wallet
    const transactions: Transaction[] = [];
    const processedHashes = new Set<string>();
    
    // Scan blocks in parallel batches
    const BATCH_SIZE = 10;
    const blockNumbers = [];
    for (let i = fromBlock; i <= currentBlock; i++) {
      blockNumbers.push(i);
    }
    
    // Process blocks in batches
    for (let i = 0; i < blockNumbers.length; i += BATCH_SIZE) {
      const batch = blockNumbers.slice(i, i + BATCH_SIZE);
      const blockPromises = batch.map(blockNum => 
        executeWithFailover(async (provider) => {
          return await provider.getBlockWithTransactions(blockNum);
        }).catch(() => null)
      );
      
      const blocks = await Promise.all(blockPromises);
      
      for (const block of blocks) {
        if (!block) continue;
        
        for (const tx of block.transactions) {
          // Check if transaction involves our wallet
          if (tx.from.toLowerCase() !== normalizedAddress && 
              (!tx.to || tx.to.toLowerCase() !== normalizedAddress)) {
            continue;
          }
          
          // Skip if already processed
          if (processedHashes.has(tx.hash)) continue;
          processedHashes.add(tx.hash);
          
          // Get transaction receipt for more details
          const receipt = await executeWithFailover(async (provider) => {
            return await provider.getTransactionReceipt(tx.hash);
          }).catch(() => null);
          
          if (!receipt) continue;
          
          const transaction: Transaction = {
            hash: tx.hash,
            nonce: tx.nonce.toString(),
            transaction_index: receipt.transactionIndex.toString(),
            from_address: tx.from,
            to_address: tx.to || '',
            value: tx.value.toString(),
            gas: tx.gasLimit.toString(),
            gas_price: tx.gasPrice?.toString() || '0',
            receipt_gas_used: receipt.gasUsed.toString(),
            receipt_status: receipt.status?.toString() || '1',
            block_timestamp: new Date(block.timestamp * 1000).toISOString(),
            block_number: block.number.toString(),
            transaction_fee: receipt.gasUsed.mul(tx.gasPrice || 0).toString(),
            erc20_transfers: [],
            native_transfers: []
          };
          
          // Parse transfer events from logs
          for (const log of receipt.logs) {
            if (log.topics[0] === TRANSFER_EVENT_TOPIC && log.topics.length >= 3) {
              try {
                const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
                const to = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
                const value = ethers.BigNumber.from(log.data);
                
                // Get token metadata
                const tokenMetadata = await getTokenMetadata(log.address);
                
                const transfer: TransactionTransfer = {
                  token_name: tokenMetadata?.name,
                  token_symbol: tokenMetadata?.symbol,
                  token_decimals: tokenMetadata?.decimals.toString(),
                  from_address: from,
                  to_address: to,
                  address: log.address,
                  value: value.toString(),
                  value_formatted: tokenMetadata ? 
                    ethers.utils.formatUnits(value, tokenMetadata.decimals) : 
                    value.toString()
                };
                
                transaction.erc20_transfers!.push(transfer);
              } catch (error) {
                // Skip malformed logs
              }
            }
          }
          
          transactions.push(transaction);
        }
      }
    }
    
    console.log(`Found ${transactions.length} recent transactions`);
    return transactions;
  } catch (error) {
    console.error('Error scanning recent transactions:', error);
    return [];
  }
}

/**
 * Main function to get transaction history using Scanner API + recent blocks
 */
export async function getScannerTransactionHistory(
  walletAddress: string,
  limit: number = 100,
  cursor?: string
): Promise<{ transactions: Transaction[]; nextCursor?: string }> {
  try {
    console.log(`Getting transaction history using Scanner API for ${walletAddress}`);
    const startTime = Date.now();
    
    // Fetch from scanner and scan recent blocks in parallel
    const [scannerData, recentTransactions] = await Promise.all([
      fetchTransactionsFromScanner(walletAddress, limit, cursor),
      !cursor ? scanRecentTransactions(walletAddress) : Promise.resolve([]) // Only scan recent on first page
    ]);
    
    // Merge transactions, removing duplicates
    const txMap = new Map<string, Transaction>();
    
    // Add scanner transactions first
    scannerData.transactions.forEach(tx => {
      txMap.set(tx.hash, tx);
    });
    
    // Add recent transactions if not already present
    recentTransactions.forEach(tx => {
      if (!txMap.has(tx.hash)) {
        txMap.set(tx.hash, tx);
      }
    });
    
    // Convert back to array and sort by block number descending
    const transactions = Array.from(txMap.values()).sort((a, b) => {
      return parseInt(b.block_number) - parseInt(a.block_number);
    });
    
    // Limit to requested amount
    const limitedTransactions = transactions.slice(0, limit);
    
    const endTime = Date.now();
    console.log(`Scanner transaction fetch completed in ${endTime - startTime}ms`);
    console.log(`Returning ${limitedTransactions.length} transactions`);
    
    return {
      transactions: limitedTransactions,
      nextCursor: scannerData.nextCursor
    };
  } catch (error) {
    console.error('Error getting scanner transaction history:', error);
    throw error;
  }
}

/**
 * Get full transaction history (all pages)
 */
export async function getFullScannerTransactionHistory(
  walletAddress: string,
  maxTransactions: number = 500
): Promise<Transaction[]> {
  try {
    const allTransactions: Transaction[] = [];
    let cursor: string | undefined;
    let page = 0;
    
    while (allTransactions.length < maxTransactions) {
      const { transactions, nextCursor } = await getScannerTransactionHistory(
        walletAddress,
        Math.min(100, maxTransactions - allTransactions.length),
        cursor
      );
      
      allTransactions.push(...transactions);
      page++;
      
      if (!nextCursor || transactions.length === 0) {
        break;
      }
      
      cursor = nextCursor;
      console.log(`Fetched page ${page}, total transactions: ${allTransactions.length}`);
    }
    
    return allTransactions;
  } catch (error) {
    console.error('Error getting full transaction history:', error);
    return [];
  }
}