import { providers, utils } from 'ethers';
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

// Method signatures for swap detection
const SWAP_METHODS = [
  'swap', 'swapExact', 'swapTokens', 'multicall', 'exactInput', 
  'exactOutput', 'swapETH', 'swapPLS', 'trade'
];

export async function fetchTransactionsFast(
  walletAddress: string,
  limit: number = 50,
  startBlock?: number
): Promise<{ transactions: Transaction[]; lastBlock: number; hasMore: boolean }> {
  try {
    const wallet = walletAddress.toLowerCase();
    const transactions: Transaction[] = [];
    
    // Get current block number
    const currentBlock = startBlock || await provider.getBlockNumber();
    const fromBlock = Math.max(currentBlock - 5000, 0); // Look back 5k blocks
    
    console.log(`Fast fetching transactions from blocks ${fromBlock} to ${currentBlock}`);
    
    // Use etherscan-style API if available (many nodes support this)
    try {
      const txListUrl = `https://rpc-pulsechain.g4mm4.io?module=account&action=txlist&address=${walletAddress}&startblock=${fromBlock}&endblock=${currentBlock}&sort=desc`;
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
      provider.getLogs(sentFilter),
      provider.getLogs(receivedFilter)
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
          
          // Parse transfers quickly
          const transfers = parseTransfers(receipt, wallet);
          
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
            method_label: getMethodLabel(tx, receipt, transfers),
            erc20_transfers: transfers,
            native_transfers: [],
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

function parseTransfers(receipt: any, wallet: string): TransactionTransfer[] {
  const transfers: TransactionTransfer[] = [];
  
  for (const log of receipt.logs) {
    if (log.topics[0] === TRANSFER_EVENT_SIGNATURE && log.topics.length === 3) {
      try {
        const from = utils.getAddress('0x' + log.topics[1].slice(26));
        const to = utils.getAddress('0x' + log.topics[2].slice(26));
        const value = log.data;
        
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
  }
  
  return transfers;
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