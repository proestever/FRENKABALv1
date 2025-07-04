import { providers, utils, Contract, BigNumber } from 'ethers';
import { Transaction, TransactionTransfer } from '../types';

// Initialize provider
const provider = new providers.JsonRpcProvider('https://rpc-pulsechain.g4mm4.io');

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Known DEX routers on PulseChain
const DEX_ROUTERS = [
  '0x165C3410fC91EF562C50559f7d2289fEbed552d9', // PulseX Router V1
  '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02', // PulseX Router V2
].map(addr => addr.toLowerCase());

export async function fetchTransactionsFromBlockchain(
  walletAddress: string,
  limit: number = 100,
  startBlock?: number
): Promise<{ transactions: Transaction[]; lastBlock: number; hasMore: boolean }> {
  try {
    const wallet = walletAddress.toLowerCase();
    const transactions: Transaction[] = [];
    
    // Get current block number
    const currentBlock = startBlock || await provider.getBlockNumber();
    console.log(`Starting transaction scan from block ${currentBlock}`);
    
    let blocksScanned = 0;
    let lastScannedBlock = currentBlock;
    const maxBlocksToScan = 1000; // Limit scanning to prevent timeout
    
    // Scan blocks in reverse order
    for (let blockNum = currentBlock; blockNum > 0 && transactions.length < limit && blocksScanned < maxBlocksToScan; blockNum--) {
      try {
        const block = await provider.getBlockWithTransactions(blockNum);
        if (!block || !block.transactions || block.transactions.length === 0) continue;
        
        blocksScanned++;
        lastScannedBlock = blockNum;
        
        // Check each transaction in the block
        for (const tx of block.transactions) {
          // Skip if not a full transaction object
          if (typeof tx === 'string') continue;
          
          // Check if transaction involves our wallet
          if (tx.from.toLowerCase() === wallet || (tx.to && tx.to.toLowerCase() === wallet)) {
            // Get transaction receipt for more details
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (!receipt) continue;
            
            // Parse ERC20 transfers
            const erc20Transfers = await parseERC20Transfers(receipt, wallet);
            
            // Detect if this is a swap
            const isSwap = detectSwap(tx, receipt, erc20Transfers);
            
            // Create transaction object
            const transaction: Transaction = {
              hash: tx.hash,
              nonce: tx.nonce.toString(),
              transaction_index: (receipt.transactionIndex || 0).toString(),
              from_address: tx.from,
              from_address_label: null,
              to_address: tx.to || '',
              to_address_label: null,
              value: tx.value.toString(),
              gas: tx.gasLimit.toString(),
              gas_price: tx.gasPrice?.toString() || '0',
              receipt_gas_used: receipt.gasUsed.toString(),
              receipt_status: receipt.status ? '1' : '0',
              block_timestamp: new Date(block.timestamp * 1000).toISOString(),
              block_number: blockNum.toString(),
              transaction_fee: receipt.gasUsed.mul(tx.gasPrice || 0).toString(),
              method_label: isSwap ? 'Swap' : (tx.data.length > 2 ? 'Contract Interaction' : 'Transfer'),
              erc20_transfers: erc20Transfers,
              native_transfers: [],
              nft_transfers: [],
              summary: isSwap ? 'Token Swap' : undefined,
              category: isSwap ? 'swap' : (tx.data.length > 2 ? 'contract' : 'transfer'),
              possible_spam: false
            };
            
            transactions.push(transaction);
            
            if (transactions.length >= limit) {
              break;
            }
          }
        }
        
        // Log progress every 100 blocks
        if (blocksScanned % 100 === 0) {
          console.log(`Scanned ${blocksScanned} blocks, found ${transactions.length} transactions`);
        }
      } catch (error) {
        console.error(`Error processing block ${blockNum}:`, error);
        // Continue with next block
      }
    }
    
    console.log(`Scan complete. Scanned ${blocksScanned} blocks, found ${transactions.length} transactions`);
    
    return {
      transactions,
      lastBlock: lastScannedBlock - 1,
      hasMore: lastScannedBlock > 1 && transactions.length >= limit
    };
  } catch (error) {
    console.error('Error fetching transactions from blockchain:', error);
    throw error;
  }
}

async function parseERC20Transfers(
  receipt: providers.TransactionReceipt,
  walletAddress: string
): Promise<TransactionTransfer[]> {
  const transfers: TransactionTransfer[] = [];
  const wallet = walletAddress.toLowerCase();
  
  for (const log of receipt.logs) {
    // Check if this is an ERC20 Transfer event
    if (log.topics[0] !== TRANSFER_EVENT_SIGNATURE || log.topics.length !== 3) continue;
    
    try {
      // Parse transfer event
      const from = '0x' + log.topics[1].slice(26).toLowerCase();
      const to = '0x' + log.topics[2].slice(26).toLowerCase();
      const value = BigNumber.from(log.data);
      
      // Only include transfers that involve our wallet
      if (from !== wallet && to !== wallet) continue;
      
      // Try to get token info (we'll need to enhance this with token metadata)
      const tokenAddress = log.address.toLowerCase();
      
      transfers.push({
        token_name: undefined,
        token_symbol: undefined,
        token_logo: undefined,
        token_decimals: '18', // Default, we'll need to fetch actual decimals
        from_address: from,
        from_address_label: undefined,
        to_address: to,
        to_address_label: undefined,
        address: tokenAddress,
        log_index: log.logIndex,
        value: value.toString(),
        value_formatted: undefined,
        possible_spam: false,
        verified_contract: false,
        security_score: undefined,
        direction: from === wallet ? 'send' : 'receive',
        internal_transaction: false
      });
    } catch (error) {
      console.error('Error parsing transfer event:', error);
    }
  }
  
  return transfers;
}

function detectSwap(
  tx: providers.TransactionResponse,
  receipt: providers.TransactionReceipt,
  transfers: TransactionTransfer[]
): boolean {
  // Check if transaction is to a known DEX router
  if (tx.to && DEX_ROUTERS.includes(tx.to.toLowerCase())) {
    return true;
  }
  
  // Check if there are both send and receive transfers
  const hasSend = transfers.some(t => t.direction === 'send');
  const hasReceive = transfers.some(t => t.direction === 'receive');
  
  return hasSend && hasReceive;
}

// Function to fetch token metadata (name, symbol, decimals)
export async function fetchTokenMetadata(tokenAddress: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
} | null> {
  try {
    const tokenContract = new Contract(
      tokenAddress,
      [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)'
      ],
      provider
    );
    
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);
    
    return { name, symbol, decimals };
  } catch (error) {
    console.error(`Error fetching token metadata for ${tokenAddress}:`, error);
    return null;
  }
}

// Batch fetch token metadata for multiple addresses
export async function batchFetchTokenMetadata(
  tokenAddresses: string[]
): Promise<Record<string, { name: string; symbol: string; decimals: number }>> {
  const metadata: Record<string, { name: string; symbol: string; decimals: number }> = {};
  
  // Process in batches to avoid overwhelming the RPC
  const batchSize = 10;
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (address) => {
        const data = await fetchTokenMetadata(address);
        return { address, data };
      })
    );
    
    for (const { address, data } of results) {
      if (data) {
        metadata[address.toLowerCase()] = data;
      }
    }
  }
  
  return metadata;
}