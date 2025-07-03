import { ethers } from 'ethers';
import { ProcessedToken } from '../types';
import { getDefaultLogo } from './blockchain-service';
import { getTokenPriceFromDexScreener } from './dexscreener';
import { storage } from '../storage';

// Initialize ethers provider
const RPC_ENDPOINT = 'https://rpc-pulsechain.g4mm4.io';
const provider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINT);

// Constants
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PLS_DECIMALS = 18;
const PLS_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WPLS_CONTRACT_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';

// Standard ERC20 ABI for getting token metadata
const ERC20_ABI = [
  {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},
  {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"}
];

interface TokenBalance {
  address: string;
  balance: ethers.BigNumber;
  decimals: number;
  symbol: string;
  name: string;
}

interface TransferEvent {
  from: string;
  to: string;
  value: ethers.BigNumber;
  tokenAddress: string;
  blockNumber: number;
  transactionHash: string;
}

/**
 * Parse a transfer event log
 */
function parseTransferEvent(log: ethers.providers.Log): TransferEvent {
  // The Transfer event has the following structure:
  // topics[0] = event signature (Transfer)
  // topics[1] = from address (padded to 32 bytes)
  // topics[2] = to address (padded to 32 bytes)
  // data = amount transferred

  const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
  const to = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
  const value = ethers.BigNumber.from(log.data);

  return {
    from,
    to,
    value,
    tokenAddress: log.address,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash
  };
}

/**
 * Get token metadata (decimals, symbol, name) with caching
 */
async function getTokenMetadata(tokenAddress: string): Promise<{decimals: number, symbol: string, name: string} | null> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
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

/**
 * Calculate token balances from complete transfer history
 */
export async function calculateBalancesFromTransferHistory(
  walletAddress: string,
  fromBlock: number = 0,
  toBlock: number | 'latest' = 'latest'
): Promise<ProcessedToken[]> {
  try {
    console.log(`Calculating balances from transfer history for ${walletAddress}`);
    const startTime = Date.now();
    
    // Normalize wallet address
    const normalizedAddress = walletAddress.toLowerCase();
    const paddedAddress = ethers.utils.hexZeroPad(normalizedAddress, 32);

    // Get current block if not specified
    if (toBlock === 'latest') {
      toBlock = await provider.getBlockNumber();
    }

    console.log(`Scanning blocks from ${fromBlock} to ${toBlock}`);

    // Fetch all transfer events where wallet is sender or receiver
    // We need to do this in two queries due to how event filtering works
    
    // 1. Get all incoming transfers (wallet is recipient)
    console.log('Fetching incoming transfers...');
    const incomingLogs = await provider.getLogs({
      fromBlock,
      toBlock,
      topics: [TRANSFER_EVENT_TOPIC, null, paddedAddress] // null means any sender
    });

    // 2. Get all outgoing transfers (wallet is sender)
    console.log('Fetching outgoing transfers...');
    const outgoingLogs = await provider.getLogs({
      fromBlock,
      toBlock,
      topics: [TRANSFER_EVENT_TOPIC, paddedAddress, null] // null means any recipient
    });

    console.log(`Found ${incomingLogs.length} incoming and ${outgoingLogs.length} outgoing transfers`);

    // Deduplicate logs by creating a unique key for each log
    const uniqueLogs = new Map<string, any>();
    
    // Process all logs and deduplicate
    [...incomingLogs, ...outgoingLogs].forEach(log => {
      const key = `${log.transactionHash}-${log.logIndex}`;
      if (!uniqueLogs.has(key)) {
        uniqueLogs.set(key, log);
      }
    });
    
    console.log(`After deduplication: ${uniqueLogs.size} unique transfer events`);

    // Parse all transfer events
    const allTransfers: TransferEvent[] = [];
    
    for (const log of Array.from(uniqueLogs.values())) {
      try {
        const transfer = parseTransferEvent(log);
        allTransfers.push(transfer);
      } catch (error) {
        console.error('Error parsing transfer event:', error);
      }
    }

    // Calculate balances by token
    const tokenBalances = new Map<string, ethers.BigNumber>();
    
    // Track processed transactions to avoid duplicates
    const processedTxs = new Set<string>();
    
    for (const transfer of allTransfers) {
      const tokenAddress = transfer.tokenAddress.toLowerCase();
      const txKey = `${transfer.transactionHash}-${transfer.tokenAddress}-${transfer.from}-${transfer.to}-${transfer.value.toString()}`;
      
      // Skip if we've already processed this exact transfer
      if (processedTxs.has(txKey)) {
        continue;
      }
      processedTxs.add(txKey);
      
      if (!tokenBalances.has(tokenAddress)) {
        tokenBalances.set(tokenAddress, ethers.BigNumber.from(0));
      }
      
      const currentBalance = tokenBalances.get(tokenAddress)!;
      
      // Debug logging for WPLS
      if (tokenAddress === WPLS_CONTRACT_ADDRESS.toLowerCase()) {
        console.log('WPLS Transfer:', {
          from: transfer.from,
          to: transfer.to,
          value: ethers.utils.formatUnits(transfer.value, 18),
          isIncoming: transfer.to.toLowerCase() === normalizedAddress,
          isOutgoing: transfer.from.toLowerCase() === normalizedAddress,
          txHash: transfer.transactionHash
        });
      }
      
      // If wallet is recipient, add to balance
      if (transfer.to.toLowerCase() === normalizedAddress) {
        tokenBalances.set(tokenAddress, currentBalance.add(transfer.value));
      }
      
      // If wallet is sender, subtract from balance
      if (transfer.from.toLowerCase() === normalizedAddress) {
        tokenBalances.set(tokenAddress, currentBalance.sub(transfer.value));
      }
    }

    console.log(`Calculated balances for ${tokenBalances.size} tokens`);
    
    // Log WPLS balance if present
    const wplsAddress = WPLS_CONTRACT_ADDRESS.toLowerCase();
    if (tokenBalances.has(wplsAddress)) {
      const wplsBalance = tokenBalances.get(wplsAddress)!;
      console.log('Final WPLS balance:', {
        raw: wplsBalance.toString(),
        formatted: ethers.utils.formatUnits(wplsBalance, 18),
        wallet: walletAddress
      });
    }

    // Get native PLS balance
    const plsBalance = await provider.getBalance(walletAddress);
    const plsBalanceFormatted = parseFloat(ethers.utils.formatUnits(plsBalance, PLS_DECIMALS));

    // Get PLS price
    const plsPrice = await getTokenPriceFromDexScreener(WPLS_CONTRACT_ADDRESS) || 0;

    // Process tokens into final format
    const processedTokens: ProcessedToken[] = [];

    // Add native PLS
    if (plsBalanceFormatted > 0) {
      processedTokens.push({
        address: PLS_TOKEN_ADDRESS,
        symbol: 'PLS',
        name: 'PulseChain',
        decimals: PLS_DECIMALS,
        balance: plsBalance.toString(),
        balanceFormatted: plsBalanceFormatted,
        price: plsPrice,
        value: plsBalanceFormatted * plsPrice,
        logo: getDefaultLogo('PLS'),
        isNative: true,
        verified: true
      });
    }

    // Process ERC20 tokens
    const tokenAddresses = Array.from(tokenBalances.keys());
    console.log(`Fetching metadata for ${tokenAddresses.length} tokens...`);

    // Process tokens in batches to avoid overwhelming the RPC
    const BATCH_SIZE = 5;
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (tokenAddress) => {
        try {
          const balance = tokenBalances.get(tokenAddress)!;
          
          // Skip if balance is zero or negative (shouldn't happen but just in case)
          if (balance.lte(0)) {
            return;
          }

          // Get token metadata
          const metadata = await getTokenMetadata(tokenAddress);
          if (!metadata) {
            return;
          }

          // Format balance
          const balanceFormatted = parseFloat(ethers.utils.formatUnits(balance, metadata.decimals));
          
          // Skip dust amounts
          if (balanceFormatted < 0.000001) {
            return;
          }

          // Get token price
          const price = await getTokenPriceFromDexScreener(tokenAddress) || 0;

          // Get token logo
          let logoUrl = getDefaultLogo(metadata.symbol);
          try {
            const storedLogo = await storage.getTokenLogo(tokenAddress);
            if (storedLogo && storedLogo.logoUrl) {
              logoUrl = storedLogo.logoUrl;
            }
          } catch (error) {
            // Use default logo if database lookup fails
          }

          processedTokens.push({
            address: tokenAddress,
            symbol: metadata.symbol,
            name: metadata.name,
            decimals: metadata.decimals,
            balance: balance.toString(),
            balanceFormatted,
            price,
            value: balanceFormatted * price,
            logo: logoUrl,
            verified: false
          });
        } catch (error) {
          console.error(`Error processing token ${tokenAddress}:`, error);
        }
      }));

      // Small delay between batches
      if (i + BATCH_SIZE < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Sort by value descending
    processedTokens.sort((a, b) => (b.value || 0) - (a.value || 0));

    const endTime = Date.now();
    console.log(`Balance calculation completed in ${endTime - startTime}ms`);
    console.log(`Found ${processedTokens.length} tokens with non-zero balances`);

    return processedTokens;
  } catch (error) {
    console.error('Error calculating balances from transfer history:', error);
    throw error;
  }
}

/**
 * Get transfer history with balance calculation for a specific time range
 */
export async function getTransferHistoryWithBalances(
  walletAddress: string,
  startBlock?: number,
  endBlock?: number
): Promise<{
  tokens: ProcessedToken[];
  transferCount: number;
  blockRange: { from: number; to: number };
}> {
  try {
    // If no start block specified, scan from genesis
    if (!startBlock) {
      startBlock = 0;
    }

    // If no end block specified, use latest
    if (!endBlock) {
      endBlock = await provider.getBlockNumber();
    }

    const tokens = await calculateBalancesFromTransferHistory(walletAddress, startBlock, endBlock);

    return {
      tokens,
      transferCount: 0, // We could calculate this if needed
      blockRange: {
        from: startBlock,
        to: endBlock
      }
    };
  } catch (error) {
    console.error('Error getting transfer history with balances:', error);
    throw error;
  }
}