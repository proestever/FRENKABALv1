import { ethers } from 'ethers';

// Event interface for swap transactions
export interface SwapEvent {
  transactionHash: string;
  timestamp: number;
  tokenIn?: string;
  tokenOut?: string;
}

// Swap detection configuration
interface SwapDetectorConfig {
  walletAddress: string;
  onSwapDetected?: (event: SwapEvent) => void;
  provider?: ethers.providers.Provider;
  checkInterval?: number; // ms
}

/**
 * Create a real-time swap detector that monitors transactions
 * for the given wallet address and triggers a callback when swaps are detected
 */
export function createSwapDetector({
  walletAddress,
  onSwapDetected,
  provider: customProvider,
  checkInterval = 5000
}: SwapDetectorConfig) {
  // If no wallet address or callback, don't do anything
  if (!walletAddress || !onSwapDetected) {
    return {
      start: () => {},
      stop: () => {}
    };
  }

  // Create provider if not provided
  const provider = customProvider || new ethers.providers.JsonRpcProvider('https://rpc.pulsechain.com');
  
  // Keep track of transactions we've already seen
  const processedTxs = new Set<string>();
  let intervalId: NodeJS.Timeout | null = null;
  let isRunning = false;
  let lastBlockChecked = 0;
  
  // Function to check for new transactions
  const checkForSwaps = async () => {
    try {
      if (!isRunning) return;
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      
      // Determine block range to scan - limit to last 100 blocks max for efficiency
      const fromBlock = lastBlockChecked > 0 
        ? lastBlockChecked + 1 
        : Math.max(currentBlock - 100, 0);
      
      // Don't scan if no new blocks
      if (fromBlock >= currentBlock) {
        return;
      }
      
      console.log(`Scanning for swaps in blocks ${fromBlock}-${currentBlock}`);

      // Define transfer event topic (keccak256 hash of Transfer(address,address,uint256))
      const transferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      // Get transfer events where this wallet is involved (both sending and receiving)
      const logs = await provider.getLogs({
        fromBlock,
        toBlock: currentBlock,
        topics: [
          transferEventTopic,
          // We need to check any transfers involving our wallet, not just specific ones
          null
        ],
      });
      
      // Filter logs by transactions involving our wallet
      const relevantLogs = logs.filter(log => {
        try {
          // Check if our wallet is involved in any topic
          const topicStr = log.topics.join('').toLowerCase();
          return topicStr.includes(walletAddress.toLowerCase().slice(2)); // Remove 0x prefix
        } catch (err) {
          return false;
        }
      });
      
      // Group logs by transaction hash
      const txMap: Record<string, ethers.providers.Log[]> = {};
      relevantLogs.forEach(log => {
        if (!txMap[log.transactionHash]) {
          txMap[log.transactionHash] = [];
        }
        txMap[log.transactionHash].push(log);
      });
      
      // Process each transaction with multiple token transfers, which likely indicates a swap
      const potentialSwapTxs = Object.entries(txMap)
        .filter(([hash, logs]) => {
          // If we've already processed this tx, skip it
          if (processedTxs.has(hash)) return false;
          
          // Mark as processed
          processedTxs.add(hash);
          
          // A swap typically has at least 2 transfer events
          return logs.length >= 2;
        })
        .map(([hash]) => hash);
      
      // For each potential swap, get the transaction and check if it's likely a swap
      if (potentialSwapTxs.length > 0) {
        console.log(`Found ${potentialSwapTxs.length} potential swap transactions`);
        
        for (const txHash of potentialSwapTxs) {
          // Skip if we've processed this tx before (defensive)
          if (processedTxs.has(txHash)) continue;
          
          try {
            // Get transaction details
            const tx = await provider.getTransaction(txHash);
            const receipt = await provider.getTransactionReceipt(txHash);
            
            // Only consider successful transactions
            if (!receipt || receipt.status !== 1) continue;
            
            // Get block for timestamp
            const block = await provider.getBlock(receipt.blockNumber);
            
            // Create swap event
            const swapEvent: SwapEvent = {
              transactionHash: txHash,
              timestamp: block.timestamp * 1000 // Convert to ms
            };
            
            // Trigger callback
            onSwapDetected(swapEvent);
          } catch (err) {
            console.error('Error processing transaction:', err);
          }
        }
      }
      
      // Update last block checked
      lastBlockChecked = currentBlock;
    } catch (error) {
      console.error('Error checking for swaps:', error);
    }
  };
  
  // Start monitoring
  const start = () => {
    if (isRunning) return;
    
    isRunning = true;
    checkForSwaps(); // Initial check
    intervalId = setInterval(checkForSwaps, checkInterval);
    console.log(`Started swap detector for wallet ${walletAddress}`);
  };
  
  // Stop monitoring
  const stop = () => {
    if (!isRunning) return;
    
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log(`Stopped swap detector for wallet ${walletAddress}`);
  };
  
  return {
    start,
    stop,
    isRunning: () => isRunning
  };
}