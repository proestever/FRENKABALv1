import { providers, utils } from 'ethers';
import { Transaction, TransactionTransfer } from '../types';

// Initialize provider - using the main PulseChain RPC endpoint
const provider = new providers.JsonRpcProvider('https://rpc.pulsechain.com');

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// WPLS Withdrawal event signature - Withdrawal(address indexed src, uint256 wad)
const WITHDRAWAL_EVENT_SIGNATURE = '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65';

// WPLS contract address
const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'.toLowerCase();

// Known DEX routers on PulseChain
const DEX_ROUTERS = [
  '0x165C3410fC91EF562C50559f7d2289fEbed552d9', // PulseX Router V1
  '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02', // PulseX Router V2
].map(addr => addr.toLowerCase());

// Method signatures for swap detection
const SWAP_METHODS = [
  'swap', 'swapExact', 'swapTokens', 'multicall', 'exactInput', 
  'exactOutput', 'swapETH', 'swapPLS', 'trade'
];

// Helper function to add timeout to promises
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

export async function fetchTransactionsFast(
  walletAddress: string,
  limit: number = 50,
  startBlock?: number
): Promise<{ transactions: Transaction[]; lastBlock: number; hasMore: boolean }> {
  try {
    const wallet = walletAddress.toLowerCase();
    const transactions: Transaction[] = [];
    
    // Get current block number with timeout
    let currentBlock: number;
    try {
      currentBlock = startBlock || await withTimeout(provider.getBlockNumber(), 5000);
    } catch (error) {
      console.error('Error getting current block number:', error);
      // Fallback to a recent block number if RPC is having issues
      currentBlock = startBlock || 24000000; // Approximate recent PulseChain block
    }
    
    const fromBlock = Math.max(currentBlock - 50000, 0); // Look back 50k blocks for more history
    
    console.log(`Fast fetching transactions from blocks ${fromBlock} to ${currentBlock}`);
    
    // Use etherscan-style API if available (many nodes support this)
    try {
      const txListUrl = `https://rpc.pulsechain.com?module=account&action=txlist&address=${walletAddress}&startblock=${fromBlock}&endblock=${currentBlock}&sort=desc`;
      const response = await fetch(txListUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.result && Array.isArray(data.result)) {
          console.log(`Found ${data.result.length} transactions via API`);
          // Process API results
          for (const tx of data.result.slice(0, limit)) {
            transactions.push(convertApiTransaction(tx));
          }
          return {
            transactions,
            lastBlock: fromBlock - 1,
            hasMore: data.result.length > limit
          };
        }
      }
    } catch (error) {
      console.log('API method not available, falling back to event logs');
    }
    
    // Fallback: Use event logs for ERC20 transfers (sent)
    const sentFilter = {
      fromBlock,
      toBlock: currentBlock,
      topics: [
        TRANSFER_EVENT_SIGNATURE,
        utils.hexZeroPad(wallet, 32), // from = wallet
        null // to = any
      ]
    };
    
    // Fallback: Use event logs for ERC20 transfers (received)
    const receivedFilter = {
      fromBlock,
      toBlock: currentBlock,
      topics: [
        TRANSFER_EVENT_SIGNATURE,
        null, // from = any
        utils.hexZeroPad(wallet, 32) // to = wallet
      ]
    };
    
    console.log('Fetching transfer events...');
    const [sentLogs, receivedLogs] = await Promise.all([
      withTimeout(provider.getLogs(sentFilter), 10000),
      withTimeout(provider.getLogs(receivedFilter), 10000)
    ]);
    const logs = [...sentLogs, ...receivedLogs];
    console.log(`Found ${logs.length} transfer events`);
    
    // Get unique transaction hashes
    const txHashes = new Set<string>();
    logs.forEach(log => txHashes.add(log.transactionHash));
    
    // Also fetch recent blocks for native transfers
    const recentBlocks = 50;
    console.log(`Checking last ${recentBlocks} blocks for native transfers...`);
    
    const blockPromises = [];
    for (let i = 0; i < recentBlocks; i++) {
      const blockNum = currentBlock - i;
      if (blockNum < 0) break;
      blockPromises.push(provider.getBlock(blockNum));
    }
    
    const blocks = await Promise.all(blockPromises);
    blocks.forEach(block => {
      if (block && block.transactions) {
        block.transactions.forEach(hash => txHashes.add(hash));
      }
    });
    
    console.log(`Total unique transactions to check: ${txHashes.size}`);
    
    // Process transactions in parallel batches
    const hashArray = Array.from(txHashes).slice(0, limit * 2); // Get more than needed
    const batchSize = 20;
    let processed = 0;
    
    for (let i = 0; i < hashArray.length && transactions.length < limit; i += batchSize) {
      const batch = hashArray.slice(i, i + batchSize);
      const batchPromises = batch.map(async hash => {
        try {
          const tx = await provider.getTransaction(hash);
          if (!tx) return null;
          
          // Only process if it involves our wallet
          if (tx.from.toLowerCase() !== wallet && (!tx.to || tx.to.toLowerCase() !== wallet)) {
            return null;
          }
          
          const receipt = await provider.getTransactionReceipt(hash);
          if (!receipt) return null;
          
          const block = await provider.getBlock(tx.blockNumber!);
          if (!block) return null;
          
          // Check if this is a swap transaction
          const isSwapTransaction = tx.to && (
            DEX_ROUTERS.includes(tx.to.toLowerCase()) ||
            (tx.data && tx.data.length >= 10 && SWAP_METHODS.some(method => 
              tx.data.toLowerCase().includes(method.toLowerCase())
            ))
          );
          
          // Parse transfers quickly
          const allTransfers = parseTransfers(receipt, wallet, isSwapTransaction);
          
          // Separate native and ERC20 transfers
          const erc20Transfers = allTransfers.filter(t => t.address !== 'native');
          const nativeTransfers = allTransfers.filter(t => t.address === 'native');
          
          // Add native PLS transfer if transaction has value
          if (tx.value && tx.value.toString() !== '0') {
            const direction = tx.from.toLowerCase() === wallet ? 'send' : 'receive';
            nativeTransfers.push({
              from_address: tx.from,
              to_address: tx.to || '',
              address: 'native',
              value: tx.value.toString(),
              log_index: -1, // No log index for direct transfers
              token_name: 'PulseChain',
              token_symbol: 'PLS',
              token_logo: '/assets/pls logo trimmed.png',
              token_decimals: '18',
              direction: direction,
              internal_transaction: false
            });
          }
          
          return {
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
            block_number: tx.blockNumber!.toString(),
            transaction_fee: receipt.gasUsed.mul(tx.gasPrice || 0).toString(),
            method_label: getMethodLabel(tx, receipt, allTransfers),
            erc20_transfers: erc20Transfers,
            native_transfers: nativeTransfers,
            nft_transfers: [],
            summary: undefined,
            category: getCategory(tx),
            possible_spam: false
          } as Transaction;
        } catch (error) {
          return null;
        }
      });
      
      const results = await Promise.all(batchPromises);
      results.forEach(tx => {
        if (tx) transactions.push(tx);
      });
      
      processed += batch.length;
      if (processed % 50 === 0) {
        console.log(`Processed ${processed} transactions, found ${transactions.length} valid`);
      }
    }
    
    // Sort by block number descending
    transactions.sort((a, b) => parseInt(b.block_number) - parseInt(a.block_number));
    
    // Limit results
    const limitedTransactions = transactions.slice(0, limit);
    
    console.log(`Fast fetch complete: ${limitedTransactions.length} transactions`);
    
    return {
      transactions: limitedTransactions,
      lastBlock: fromBlock - 1,
      hasMore: transactions.length > limit || fromBlock > 0
    };
  } catch (error) {
    console.error('Error in fast fetch:', error);
    throw error;
  }
}

function parseTransfers(receipt: any, wallet: string, isSwapTransaction: boolean = false): TransactionTransfer[] {
  const transfers: TransactionTransfer[] = [];
  const nativeTransfers: TransactionTransfer[] = [];
  
  for (const log of receipt.logs) {
    // Handle ERC20 Transfer events
    if (log.topics[0] === TRANSFER_EVENT_SIGNATURE && log.topics.length === 3) {
      try {
        const from = utils.getAddress('0x' + log.topics[1].slice(26));
        const to = utils.getAddress('0x' + log.topics[2].slice(26));
        const value = log.data;
        
        // Only include transfers that involve the wallet address
        if (from.toLowerCase() !== wallet.toLowerCase() && to.toLowerCase() !== wallet.toLowerCase()) {
          continue; // Skip transfers that don't involve our wallet
        }
        
        // Determine direction based on wallet address
        let direction: 'send' | 'receive' | 'self' | undefined;
        if (from.toLowerCase() === wallet.toLowerCase() && to.toLowerCase() === wallet.toLowerCase()) {
          direction = 'self';
        } else if (from.toLowerCase() === wallet.toLowerCase()) {
          direction = 'send';
        } else if (to.toLowerCase() === wallet.toLowerCase()) {
          direction = 'receive';
        }
        
        transfers.push({
          from_address: from,
          to_address: to,
          address: log.address,
          value: value,
          log_index: log.logIndex,
          token_name: undefined,
          token_symbol: undefined,
          token_logo: undefined,
          token_decimals: undefined,
          direction: direction
        });
      } catch (error) {
        // Skip invalid transfers
      }
    }
    
    // Handle WPLS Withdrawal events - these represent native PLS received
    // IMPORTANT: Skip ALL WPLS withdrawals in swap transactions to avoid double-counting
    if (log.topics[0] === WITHDRAWAL_EVENT_SIGNATURE && log.address.toLowerCase() === WPLS_ADDRESS && !isSwapTransaction) {
      try {
        // For Withdrawal event, topics[1] contains the source address (who withdrew)
        const src = utils.getAddress('0x' + log.topics[1].slice(26));
        const value = log.data; // The amount of WPLS withdrawn (same as PLS received)
        
        // Only count if the wallet itself initiated the withdrawal
        // This prevents double-counting when routers handle WPLS internally during swaps
        if (src.toLowerCase() === wallet.toLowerCase()) {
          // Direct withdrawal by the wallet - they're unwrapping WPLS to PLS
          nativeTransfers.push({
            from_address: WPLS_ADDRESS,
            to_address: wallet,
            address: 'native', // Mark as native PLS
            value: value,
            log_index: log.logIndex,
            token_name: 'PulseChain',
            token_symbol: 'PLS',
            token_logo: '/assets/pls logo trimmed.png',
            token_decimals: '18',
            direction: 'receive',
            internal_transaction: true
          });
        }
        // Skip router withdrawals - the native PLS transfer is already counted
        // when the user sends PLS to the router at the beginning of the swap
      } catch (error) {
        console.error('Error parsing WPLS withdrawal event:', error);
      }
    }
  }
  
  // Merge native transfers into the transfers array
  return [...transfers, ...nativeTransfers];
}

function getMethodLabel(tx: any, receipt: any, transfers: TransactionTransfer[]): string {
  // Check if it's a DEX interaction
  if (tx.to && DEX_ROUTERS.includes(tx.to.toLowerCase())) {
    return 'Swap';
  }
  
  // Check method signature
  if (tx.data && tx.data.length >= 10) {
    const methodId = tx.data.slice(0, 10);
    const hasSwapMethod = SWAP_METHODS.some(method => 
      tx.data.toLowerCase().includes(method.toLowerCase())
    );
    if (hasSwapMethod) return 'Swap';
  }
  
  // Check for multiple transfers (likely a swap)
  if (transfers.length >= 2) {
    return 'Swap';
  }
  
  if (tx.data && tx.data.length > 2) {
    return 'Contract Interaction';
  }
  
  return 'Transfer';
}

function getCategory(tx: any): string {
  if (tx.to && DEX_ROUTERS.includes(tx.to.toLowerCase())) {
    return 'swap';
  }
  if (tx.data && tx.data.length > 2) {
    return 'contract';
  }
  return 'transfer';
}

function convertApiTransaction(apiTx: any): Transaction {
  return {
    hash: apiTx.hash,
    nonce: apiTx.nonce,
    transaction_index: apiTx.transactionIndex,
    from_address: apiTx.from,
    from_address_label: null,
    to_address: apiTx.to || '',
    to_address_label: null,
    value: apiTx.value,
    gas: apiTx.gas,
    gas_price: apiTx.gasPrice,
    receipt_gas_used: apiTx.gasUsed,
    receipt_status: apiTx.txreceipt_status || '1',
    block_timestamp: new Date(parseInt(apiTx.timeStamp) * 1000).toISOString(),
    block_number: apiTx.blockNumber,
    transaction_fee: (BigInt(apiTx.gasUsed) * BigInt(apiTx.gasPrice)).toString(),
    method_label: apiTx.functionName || 'Transfer',
    erc20_transfers: [],
    native_transfers: [],
    nft_transfers: [],
    summary: undefined,
    category: apiTx.to ? 'contract' : 'transfer',
    possible_spam: false
  };
}

// Export the token metadata fetching function from the original service
export { batchFetchTokenMetadata } from './blockchain-transaction-service';