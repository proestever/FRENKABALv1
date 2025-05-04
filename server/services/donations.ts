import { getWalletTransactionHistory } from './api';
import { Transaction, TransactionTransfer } from '../types';

// Donation tracker interface
export interface DonationRecord {
  donorAddress: string;
  totalValueUsd: number;
  donations: Donation[];
}

export interface Donation {
  txHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  tokenLogo?: string;
  amount: string;
  valueUsd: number;
  timestamp: number;
}

// Cache donation records to avoid reprocessing every request
let donationCache: Record<string, DonationRecord> = {};
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a transaction is a donation to the specified address
 */
function isDonation(transaction: Transaction, donationAddress: string): boolean {
  // Check if the transaction is to the donation address
  if (transaction.to_address.toLowerCase() === donationAddress.toLowerCase()) {
    return true;
  }
  
  // Check if any ERC20 transfers were made to the donation address
  if (transaction.erc20_transfers && transaction.erc20_transfers.length > 0) {
    for (const transfer of transaction.erc20_transfers) {
      if (transfer.to_address.toLowerCase() === donationAddress.toLowerCase()) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get donation amount and token details from a transaction
 */
function getDonationDetails(transaction: Transaction, donationAddress: string): Donation[] {
  const donations: Donation[] = [];
  
  // Check for native token transfer
  if (transaction.to_address.toLowerCase() === donationAddress.toLowerCase() && 
      transaction.value !== '0') {
    // Convert the Wei value to PLS (18 decimals) and then estimate USD value
    const valueInPls = parseFloat(transaction.value) / 1e18;
    donations.push({
      txHash: transaction.hash,
      tokenAddress: '0x0000000000000000000000000000000000000000', // Native PLS
      tokenSymbol: 'PLS',
      tokenName: 'Pulse',
      tokenLogo: '/assets/pls logo trimmed.png',
      amount: valueInPls.toString(),
      valueUsd: valueInPls * 0.00012, // Current PLS/USD approximate rate
      timestamp: new Date(transaction.block_timestamp).getTime()
    });
  }
  
  // Check for ERC20 transfers
  if (transaction.erc20_transfers && transaction.erc20_transfers.length > 0) {
    for (const transfer of transaction.erc20_transfers) {
      if (transfer.to_address.toLowerCase() === donationAddress.toLowerCase()) {
        // Get token decimals (default to 18 if not available)
        const tokenDecimals = parseInt(transfer.token_decimals || '18', 10);
        // Convert raw value to token amount using decimals
        const valueInTokens = parseFloat(transfer.value) / Math.pow(10, tokenDecimals);
        
        // Use the formatted value if available, otherwise use our calculated amount
        const formattedAmount = transfer.value_formatted ? 
          parseFloat(transfer.value_formatted) : valueInTokens;
        
        donations.push({
          txHash: transaction.hash,
          tokenAddress: transfer.address || '',
          tokenSymbol: transfer.token_symbol || 'Unknown',
          tokenName: transfer.token_name,
          tokenLogo: transfer.token_logo || undefined,
          amount: formattedAmount.toString(),
          // Estimate a reasonable USD value - this will vary by token
          valueUsd: formattedAmount * (transfer.token_symbol === 'DAI' ? 1.0 : 0.01),
          timestamp: new Date(transaction.block_timestamp).getTime()
        });
      }
    }
  }
  
  return donations;
}

/**
 * Fetch and process all donations for a donation address
 */
export async function getDonations(donationAddress: string): Promise<DonationRecord[]> {
  // Check cache
  const now = Date.now();
  if (lastCacheUpdate > 0 && now - lastCacheUpdate < CACHE_TTL) {
    return Object.values(donationCache);
  }
  
  try {
    // Fetch transactions for the donation address
    const maxPages = 5; // Limit to 5 pages to avoid API overload
    const txPerPage = 100;
    let cursor: string | null = null;
    let allTransactions: Transaction[] = [];
    
    for (let page = 0; page < maxPages; page++) {
      const response = await getWalletTransactionHistory(donationAddress, txPerPage, cursor);
      
      if (!response || !response.result) {
        break;
      }
      
      allTransactions = [...allTransactions, ...response.result];
      
      // Update cursor for pagination
      cursor = response.cursor || null;
      
      // If no more results or no cursor, break
      if (!cursor || response.result.length < txPerPage) {
        break;
      }
    }
    
    // Process transactions into donations
    const newDonationCache: Record<string, DonationRecord> = {};
    
    for (const tx of allTransactions) {
      if (isDonation(tx, donationAddress)) {
        const donationDetails = getDonationDetails(tx, donationAddress);
        
        for (const donation of donationDetails) {
          const donorAddress = tx.from_address;
          
          if (!newDonationCache[donorAddress]) {
            newDonationCache[donorAddress] = {
              donorAddress,
              totalValueUsd: 0,
              donations: []
            };
          }
          
          newDonationCache[donorAddress].donations.push(donation);
          newDonationCache[donorAddress].totalValueUsd += donation.valueUsd;
        }
      }
    }
    
    // Sort donations by timestamp (newest first)
    for (const record of Object.values(newDonationCache)) {
      record.donations.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Update cache
    donationCache = newDonationCache;
    lastCacheUpdate = now;
    
    return Object.values(newDonationCache);
  } catch (error) {
    console.error('Error fetching donations:', error);
    return Object.values(donationCache);
  }
}

/**
 * Get top donors ranked by total donation value
 */
export function getTopDonors(donationRecords: DonationRecord[], limit = 100): DonationRecord[] {
  return donationRecords
    .sort((a, b) => b.totalValueUsd - a.totalValueUsd)
    .slice(0, limit)
    .map((record, index) => ({
      ...record,
      rank: index + 1
    }));
}

/**
 * Clear the donation cache to force refresh on next request
 */
export function clearDonationCache(): void {
  donationCache = {};
  lastCacheUpdate = 0;
}