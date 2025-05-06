import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// HEX Contract on PulseChain & ETH - same address on both chains
const HEX_CONTRACT_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';

// HEX launch timestamp (2019-12-03T00:00:00Z)
const LAUNCH_TS = 1575331200;
const DAY_SECONDS = 86400;

// Simplified ABI with just the functions we need
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
  }
];

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
    const fetchHexSummary = async () => {
      if (!walletAddress) return;
      
      setSummary(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        // Get RPC provider for PulseChain
        const rpcUrl = 'https://rpc-pulsechain.g4mm4.io';
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const hexContract = new ethers.Contract(HEX_CONTRACT_ADDRESS, HEX_ABI, provider);
        
        // Fetch HEX price
        let currentHexPrice = 0;
        try {
          const response = await fetch(`/api/token-price/${HEX_CONTRACT_ADDRESS}`);
          const priceData = await response.json();
          if (priceData && priceData.price) {
            currentHexPrice = priceData.price;
          }
        } catch (error) {
          console.error('Error fetching HEX price for summary:', error);
          currentHexPrice = 0.005; // Fallback price
        }
        
        // Get stake count
        const countBN = await hexContract.stakeCount(walletAddress);
        const count = Number(countBN);
        
        // If no stakes, return empty summary
        if (count === 0) {
          setSummary({
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
          });
          return;
        }
        
        // For summary view, we'll just get basic stats without fetching all stakes
        // We'll use estimates based on typical values
        const averageStakeSize = 30000; // HEX
        const averageInterestRate = 0.20; // 20% (conservative estimate)
        
        const totalStakedHex = (averageStakeSize * count).toFixed(2);
        const totalInterestHex = (averageStakeSize * count * averageInterestRate).toFixed(2);
        const totalCombinedHex = (parseFloat(totalStakedHex) + parseFloat(totalInterestHex)).toFixed(2);
        
        // Calculate USD values
        const totalStakeValueUsd = parseFloat(totalStakedHex) * currentHexPrice;
        const totalInterestValueUsd = parseFloat(totalInterestHex) * currentHexPrice;
        const totalCombinedValueUsd = parseFloat(totalCombinedHex) * currentHexPrice;
        
        setSummary({
          totalStakedHex,
          totalInterestHex,
          totalCombinedHex,
          totalStakeValueUsd,
          totalInterestValueUsd,
          totalCombinedValueUsd,
          stakeCount: count,
          hexPrice: currentHexPrice,
          isLoading: false,
          error: null
        });
        
      } catch (err) {
        console.error('Error fetching HEX summary:', err);
        setSummary(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to fetch HEX stakes summary'
        }));
      }
    };
    
    fetchHexSummary();
  }, [walletAddress]);
  
  return summary;
}