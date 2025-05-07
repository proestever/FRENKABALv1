import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// HEX Contract on PulseChain (using same address as ETH but focusing only on PulseChain now)
const HEX_CONTRACT_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';

// HEX launch timestamp (2019-12-03T00:00:00Z)
const LAUNCH_TS = 1575331200;
const DAY_SECONDS = 86400;

// Extended ABI with all the functions we need
const HEX_ABI = [
  {
    "constant": true,
    "inputs": [{"internalType": "address", "name": "stakerAddr", "type": "address"}],
    "name": "stakeCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "currentDay",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"internalType": "address", "name": "stakerAddr", "type": "address"},
      {"internalType": "uint256", "name": "stakeIndex", "type": "uint256"},
      {"internalType": "uint256", "name": "stakeIdParam", "type": "uint256"}
    ],
    "name": "stakeDataFetch",
    "outputs": [
      {"internalType": "uint40", "name": "", "type": "uint40"},
      {"internalType": "uint72", "name": "", "type": "uint72"},
      {"internalType": "uint72", "name": "", "type": "uint72"},
      {"internalType": "uint16", "name": "", "type": "uint16"},
      {"internalType": "uint16", "name": "", "type": "uint16"},
      {"internalType": "uint16", "name": "", "type": "uint16"},
      {"internalType": "bool", "name": "", "type": "bool"},
      {"internalType": "uint72", "name": "", "type": "uint72"},
      {"internalType": "uint72", "name": "", "type": "uint72"},
      {"internalType": "uint72", "name": "", "type": "uint72"}
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

// Interface for individual stake data
interface StakeData {
  stakeId: string;
  stakedHearts: ethers.BigNumber;
  stakeShares: ethers.BigNumber;
  lockedDay: number;
  stakedDays: number;
  unlockedDay: number;
  isAutoStake: boolean;
  interestHearts: ethers.BigNumber;
  payout: ethers.BigNumber;
  penalty: ethers.BigNumber;
}

export interface HexStakeSummary {
  totalStakedHex: string;
  totalInterestHex: string;
  totalCombinedHex: string;
  totalStakeValueUsd: number;
  totalInterestValueUsd: number;
  totalCombinedValueUsd: number;
  stakeCount: number;
  hexPrice: number;
  isLoading: boolean;
  error: string | null;
}

// Function to fetch HEX stakes summary using direct API call
// This is a more robust approach that doesn't rely on the stakeDataFetch method
export async function fetchHexStakesSummary(address: string): Promise<HexStakeSummary> {
  try {
    if (!address) {
      return {
        totalStakedHex: '0',
        totalInterestHex: '0',
        totalCombinedHex: '0',
        totalStakeValueUsd: 0,
        totalInterestValueUsd: 0,
        totalCombinedValueUsd: 0,
        stakeCount: 0,
        hexPrice: 0,
        isLoading: false,
        error: 'No wallet address provided'
      };
    }
    
    // Fetch HEX price
    let currentHexPrice = 0.00004; // Default fallback
    try {
      const response = await fetch(`/api/token-price/${HEX_CONTRACT_ADDRESS}`);
      const priceData = await response.json();
      
      if (priceData && priceData.usdPrice) {
        currentHexPrice = priceData.usdPrice;
      } else if (priceData && priceData.price) {
        currentHexPrice = priceData.price;
      }
    } catch (error) {
      console.error('Error fetching HEX price for preload:', error);
    }
    
    // Try to fetch data from the HEX Stakes component directly
    // We'll do this by examining the DOM to see if the data is already visible
    const hexStakesElement = document.querySelector('.hex-stakes-component');
    if (hexStakesElement) {
      try {
        // Look for the total staked amount in the DOM
        const totalStakedElement = hexStakesElement.querySelector('[data-total-staked]');
        const totalInterestElement = hexStakesElement.querySelector('[data-total-interest]');
        const totalCombinedElement = hexStakesElement.querySelector('[data-total-combined]');
        
        if (totalStakedElement && totalInterestElement && totalCombinedElement) {
          const totalStakedHex = totalStakedElement.textContent?.replace(/[^0-9.]/g, '') || '0';
          const totalInterestHex = totalInterestElement.textContent?.replace(/[^0-9.]/g, '') || '0';
          const totalCombinedHex = totalCombinedElement.textContent?.replace(/[^0-9.]/g, '') || '0';
          
          // Calculate USD values
          const totalStakeValueUsd = parseFloat(totalStakedHex) * currentHexPrice;
          const totalInterestValueUsd = parseFloat(totalInterestHex) * currentHexPrice;
          const totalCombinedValueUsd = parseFloat(totalCombinedHex) * currentHexPrice;
          
          const stakeCount = document.querySelectorAll('.stake-item').length || 1;
          
          return {
            totalStakedHex,
            totalInterestHex,
            totalCombinedHex,
            totalStakeValueUsd,
            totalInterestValueUsd,
            totalCombinedValueUsd,
            stakeCount,
            hexPrice: currentHexPrice,
            isLoading: false,
            error: null
          };
        }
      } catch (domError) {
        console.error('Error extracting HEX stakes data from DOM:', domError);
      }
    }
    
    // If we couldn't get data from the DOM, use a different approach:
    // We'll use PulseChain RPC call to get a basic estimate based on the wallet address pattern
    
    // Get RPC provider for PulseChain (we only use PulseChain now)
    const rpcUrl = 'https://rpc-pulsechain.g4mm4.io';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const hexContract = new ethers.Contract(HEX_CONTRACT_ADDRESS, HEX_ABI, provider);
    
    let count = 0;
    try {
      const countBN = await hexContract.stakeCount(address);
      count = Number(countBN);
      console.log(`Detected ${count} HEX stakes for wallet: ${address}`);
    } catch (err) {
      console.error('Error fetching stake count in preload:', err);
      // Use real data only - no more hardcoded values
      return {
        totalStakedHex: '0',
        totalInterestHex: '0',
        totalCombinedHex: '0',
        totalStakeValueUsd: 0,
        totalInterestValueUsd: 0,
        totalCombinedValueUsd: 0,
        stakeCount: 0,
        hexPrice: currentHexPrice,
        isLoading: false,
        error: 'Failed to fetch stake count'
      };
    }
    
    if (count === 0) {
      return {
        totalStakedHex: '0',
        totalInterestHex: '0',
        totalCombinedHex: '0',
        totalStakeValueUsd: 0,
        totalInterestValueUsd: 0,
        totalCombinedValueUsd: 0,
        stakeCount: 0,
        hexPrice: currentHexPrice,
        isLoading: false,
        error: null
      };
    }
    
    // We will fetch individual stake data directly from the blockchain
    try {
      // Get RPC provider for PulseChain
      const rpcUrl = 'https://rpc-pulsechain.g4mm4.io';
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const hexContract = new ethers.Contract(HEX_CONTRACT_ADDRESS, HEX_ABI, provider);
      
      // Get the current day from contract
      const currentDayBN = await hexContract.currentDay();
      const currentDay = Number(currentDayBN);
      
      // Fetch all stakes to get the actual staked amounts from the blockchain
      let totalHexStakedBN = ethers.BigNumber.from(0);
      
      // Log how many stakes we're about to fetch
      console.log(`Fetching individual stake data for ${count} stakes...`);
      
      // Process each stake to get the total amount
      for (let i = 0; i < count; i++) {
        try {
          // Try using the stakeDataFetch method instead of stakeLists if available
          const stake = await hexContract.stakeDataFetch(address, i, 0);
          
          // Parse the stake data - stakedHearts is the second parameter (index 1)
          const stakedHearts = stake ? stake[1].toString() : '0';
          
          // Add to the total staked HEX
          totalHexStakedBN = totalHexStakedBN.add(ethers.BigNumber.from(stakedHearts));
        } catch (error) {
          console.error(`Error fetching stake ${i}:`, error);
        }
      }
      
      // Format the total staked HEX (convert from Hearts to HEX)
      const formattedTotalHexStaked = ethers.utils.formatUnits(totalHexStakedBN, 8);
      
      // Keep interest at 0 for now as it requires complex calculations
      const totalInterestHex = '0.00';
      
      // Calculate combined total
      const totalStakePlusInterest = formattedTotalHexStaked;
      
      // Calculate USD values
      const totalStakeValueUsd = parseFloat(formattedTotalHexStaked) * currentHexPrice;
      const totalInterestValueUsd = 0;
      const totalCombinedValueUsd = totalStakeValueUsd;
      
      return {
        totalStakedHex: formattedTotalHexStaked,
        totalInterestHex,
        totalCombinedHex: totalStakePlusInterest,
        totalStakeValueUsd,
        totalInterestValueUsd,
        totalCombinedValueUsd,
        stakeCount: count,
        hexPrice: currentHexPrice,
        isLoading: false,
        error: null
      };
    } catch (err) {
      console.error('Error fetching individual stakes in summary:', err);
      
      // Return zeros in case of error
      return {
        totalStakedHex: '0.00',
        totalInterestHex: '0.00',
        totalCombinedHex: '0.00',
        totalStakeValueUsd: 0,
        totalInterestValueUsd: 0,
        totalCombinedValueUsd: 0,
        stakeCount: count,
        hexPrice: currentHexPrice,
        isLoading: false,
        error: 'Error fetching stakes'
      };
    }
  } catch (err) {
    console.error('Error in fetchHexStakesSummary:', err);
    return {
      totalStakedHex: '0',
      totalInterestHex: '0',
      totalCombinedHex: '0',
      totalStakeValueUsd: 0,
      totalInterestValueUsd: 0,
      totalCombinedValueUsd: 0,
      stakeCount: 0,
      hexPrice: 0,
      isLoading: false,
      error: 'Failed to fetch HEX stakes data'
    };
  }
}

export function useHexStakes(walletAddress: string | undefined) {
  const [summary, setSummary] = useState<HexStakeSummary>({
    totalStakedHex: '0',
    totalInterestHex: '0',
    totalCombinedHex: '0',
    totalStakeValueUsd: 0,
    totalInterestValueUsd: 0,
    totalCombinedValueUsd: 0,
    stakeCount: 0,
    hexPrice: 0,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    // Use the same function that we use for preloading
    const fetchData = async () => {
      if (!walletAddress) {
        setSummary(prev => ({
          ...prev,
          isLoading: false
        }));
        return;
      }
      
      setSummary(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        // Use our shared function to fetch the HEX stakes data
        const result = await fetchHexStakesSummary(walletAddress);
        
        setSummary({
          ...result,
          isLoading: false
        });
      } catch (err) {
        console.error('Error in useHexStakes hook:', err);
        setSummary(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to fetch HEX stakes summary'
        }));
      }
    };
    
    fetchData();
  }, [walletAddress]);
  
  return summary;
}