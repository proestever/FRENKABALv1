import { getWalletTransactionHistory, getTokenPrice } from './api';
import { Transaction, TransactionTransfer } from '../types';
import Moralis from 'moralis';

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
 * Get token price using Moralis API
 */
async function getTokenPriceFromMoralis(tokenAddress: string): Promise<number> {
  try {
    // Special case for native PLS token
    if (tokenAddress === '0x0000000000000000000000000000000000000000' || 
        tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      // Use Moralis to get the PLS price
      try {
        const response = await Moralis.EvmApi.token.getTokenPrice({
          chain: "0x171", // PulseChain chain ID
          address: "0x8a810ea8B121d08342E9e7696f4a9915cBE494B7" // WPLS contract address
        });
        
        if (response && response.raw && response.raw.usdPrice) {
          console.log(`Got PLS price from Moralis: $${response.raw.usdPrice}`);
          return Number(response.raw.usdPrice);
        }
      } catch (plsError) {
        console.log("Error getting PLS price from Moralis:", plsError);
      }
      
      // Fallback to default value if API call fails
      return 0.00012; // Default PLS price estimate
    }
    
    // For other tokens
    try {
      const response = await Moralis.EvmApi.token.getTokenPrice({
        chain: "0x171", // PulseChain chain ID
        address: tokenAddress
      });
      
      if (response && response.raw && response.raw.usdPrice) {
        console.log(`Got token price for ${tokenAddress} from Moralis: $${response.raw.usdPrice}`);
        return Number(response.raw.usdPrice);
      }
    } catch (tokenError) {
      console.log(`Error getting price for token ${tokenAddress} from Moralis:`, tokenError);
    }
    
    // Fallback values based on common tokens
    if (tokenAddress.toLowerCase() === '0xca9ba905926e4592632d11827edc47607c92e585') {
      return 1.0; // DAI
    }
    if (tokenAddress.toLowerCase() === '0x95b303987a60c71504d99aa1b13b4da07b0790ab') {
      return 0.000067; // PLSX
    }
    if (tokenAddress.toLowerCase() === '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39') {
      return 0.00725; // HEX
    }
    
    // Default fallback
    return 0.001;
  } catch (error) {
    console.error('Error getting token price:', error);
    return 0.001; // Default fallback price
  }
}

/**
 * Get donation amount and token details from a transaction
 */
async function getDonationDetails(transaction: Transaction, donationAddress: string): Promise<Donation[]> {
  const donations: Donation[] = [];
  const pricePromises: Promise<void>[] = [];
  
  // Check for native token transfer
  if (transaction.to_address.toLowerCase() === donationAddress.toLowerCase() && 
      transaction.value !== '0') {
    
    // Convert the Wei value to PLS (18 decimals)
    const valueInPls = parseFloat(transaction.value) / 1e18;
    
    const nativeDonation: Donation = {
      txHash: transaction.hash,
      tokenAddress: '0x0000000000000000000000000000000000000000', // Native PLS
      tokenSymbol: 'PLS',
      tokenName: 'Pulse',
      tokenLogo: '/assets/pls logo trimmed.png',
      amount: valueInPls.toString(),
      valueUsd: 0, // Will be updated with price
      timestamp: new Date(transaction.block_timestamp).getTime()
    };
    
    // Add promise to get the price and update the donation
    pricePromises.push(
      getTokenPriceFromMoralis('0x0000000000000000000000000000000000000000').then(price => {
        nativeDonation.valueUsd = valueInPls * price;
      })
    );
    
    donations.push(nativeDonation);
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
        
        const tokenDonation: Donation = {
          txHash: transaction.hash,
          tokenAddress: transfer.address || '',
          tokenSymbol: transfer.token_symbol || 'Unknown',
          tokenName: transfer.token_name,
          tokenLogo: transfer.token_logo || undefined,
          amount: formattedAmount.toString(),
          valueUsd: 0, // Will be updated with price
          timestamp: new Date(transaction.block_timestamp).getTime()
        };
        
        // Add promise to get the price and update the donation
        pricePromises.push(
          getTokenPriceFromMoralis(transfer.address || '').then(price => {
            tokenDonation.valueUsd = formattedAmount * price;
          })
        );
        
        donations.push(tokenDonation);
      }
    }
  }
  
  // Wait for all price promises to complete
  await Promise.all(pricePromises);
  
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
    
    // Process all transactions in sequence
    for (const tx of allTransactions) {
      if (isDonation(tx, donationAddress)) {
        // Now await the async function call
        const donationDetails = await getDonationDetails(tx, donationAddress);
        
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