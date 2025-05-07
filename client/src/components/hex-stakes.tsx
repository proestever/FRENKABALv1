import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { ethers } from 'ethers';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { formatCurrency, formatTokenAmount, formatUsd } from '@/lib/utils';

// HEX Contract on PulseChain & ETH - same address on both chains
const HEX_CONTRACT_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';

// HEX launch timestamp (2019-12-03T00:00:00Z)
const LAUNCH_TS = 1575331200;
const DAY_SECONDS = 86400;

// Simplified ABI with just the functions we need for stakes
const HEX_ABI = [
  // Read stakeCount 
  {
    "constant": true,
    "inputs": [{"internalType": "address", "name": "stakerAddr", "type": "address"}],
    "name": "stakeCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  // Read stakeLists
  {
    "constant": true,
    "inputs": [
      {"internalType": "address", "name": "stakerAddr", "type": "address"},
      {"internalType": "uint256", "name": "stakeIndex", "type": "uint256"}
    ],
    "name": "stakeLists",
    "outputs": [
      {"internalType": "uint40", "name": "stakeId", "type": "uint40"},
      {"internalType": "uint72", "name": "stakedHearts", "type": "uint72"},
      {"internalType": "uint72", "name": "stakeShares", "type": "uint72"},
      {"internalType": "uint16", "name": "lockedDay", "type": "uint16"},
      {"internalType": "uint16", "name": "stakedDays", "type": "uint16"},
      {"internalType": "uint16", "name": "unlockedDay", "type": "uint16"},
      {"internalType": "bool", "name": "isAutoStake", "type": "bool"}
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  // Get the current day
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

interface HexStake {
  stakeId: string;
  stakedHearts: string;
  stakeShares: string;
  lockedDay: number;
  stakedDays: number;
  unlockedDay: number;
  isAutoStake: boolean;
  lockDate: string;
  unlockDate: string | null;
  endDate: string;
  isActive: boolean;
  progressPercentage: number;
  hexAmount: string;
  daysRemaining: number | null;
  interestEarned?: string;
  valueUsd?: number;
  interestValueUsd?: number;
  totalValueUsd?: number;
}

interface HexStakesProps {
  walletAddress: string;
  onClose?: () => void;
}

type SortOption = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | 'end-date' | 'progress';

export function HexStakes({ walletAddress, onClose }: HexStakesProps) {
  const [stakes, setStakes] = useState<HexStake[]>([]);
  const [sortedStakes, setSortedStakes] = useState<HexStake[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalHexStaked, setTotalHexStaked] = useState('0');
  const [totalInterest, setTotalInterest] = useState('0');
  const [totalStakePlusInterest, setTotalStakePlusInterest] = useState('0');
  const [hexPrice, setHexPrice] = useState(0);
  const [stakedValueUsd, setStakedValueUsd] = useState(0);
  const [interestValueUsd, setInterestValueUsd] = useState(0);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [stakeCount, setStakeCount] = useState(0);
  // Always use PulseChain now that we're focusing only on PulseChain stakes
  const chainId = '0x171'; // PulseChain

  // Fetch hex stakes
  useEffect(() => {
    const fetchHexStakes = async () => {
      if (!walletAddress) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Always use PulseChain RPC
        const rpcUrl = 'https://rpc-pulsechain.g4mm4.io'; // PulseChain
        
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const hexContract = new ethers.Contract(HEX_CONTRACT_ADDRESS, HEX_ABI, provider);
        
        // Fetch HEX price
        let currentHexPrice = 0.006; // Default fallback price for PulseChain
        try {
          // Use API to fetch price
          const response = await fetch(`/api/token-price/${HEX_CONTRACT_ADDRESS}`);
          const priceData = await response.json();
          console.log('HEX price data from API:', priceData);
          
          if (priceData && priceData.price) {
            currentHexPrice = priceData.price;
            console.log('Using HEX price from API:', currentHexPrice);
          } else if (priceData && priceData.usdPrice) {
            // Try alternate field if available
            currentHexPrice = priceData.usdPrice;
            console.log('Using HEX usdPrice from API:', currentHexPrice);
          } else {
            console.log('Using fallback HEX price:', currentHexPrice);
          }
        } catch (error) {
          console.error('Error fetching HEX price:', error);
          console.log('Using fallback HEX price after error:', currentHexPrice);
        }
        
        setHexPrice(currentHexPrice);
        
        // Get the current day from contract
        const currentDayBN = await hexContract.currentDay();
        const currentDay = Number(currentDayBN);
        
        // Get stake count for address
        const countBN = await hexContract.stakeCount(walletAddress);
        const count = Number(countBN);
        setStakeCount(count);
        
        if (count === 0) {
          setStakes([]);
          setTotalHexStaked('0');
          setTotalInterest('0');
          setTotalStakePlusInterest('0');
          setIsLoading(false);
          return;
        }
        
        // Fetch all stakes
        const stakesData: HexStake[] = [];
        let totalHexStakedBN = ethers.BigNumber.from(0);
        let totalInterestBN = 0;
        
        for (let i = 0; i < count; i++) {
          const stake = await hexContract.stakeLists(walletAddress, i);
          
          // Parse raw stake data
          const stakeId = stake[0].toString();
          const stakedHearts = stake[1].toString();
          const stakeShares = stake[2].toString();
          const lockedDay = Number(stake[3]);
          const stakedDays = Number(stake[4]);
          const unlockedDay = Number(stake[5]);
          const isAutoStake = stake[6];
          
          // Convert locked/unlocked days to dates
          const lockDate = new Date((LAUNCH_TS + lockedDay * DAY_SECONDS) * 1000);
          const unlockDate = unlockedDay === 0
            ? null // Still locked
            : new Date((LAUNCH_TS + unlockedDay * DAY_SECONDS) * 1000);
          
          // Calculate end date (maturity date)
          const endDate = new Date((LAUNCH_TS + (lockedDay + stakedDays) * DAY_SECONDS) * 1000);
          
          // Determine if stake is still active
          const isActive = unlockedDay === 0;
          
          // Calculate progress percentage
          let progressPercentage = 0;
          const endDay = lockedDay + stakedDays;
          
          if (isActive && currentDay >= lockedDay) {
            // If stake is active and we're past the lock day
            const daysPassed = currentDay - lockedDay;
            progressPercentage = Math.min(100, Math.floor((daysPassed / stakedDays) * 100));
          } else if (!isActive) {
            // Stake is ended
            progressPercentage = 100;
          }
          
          // Calculate days remaining
          let daysRemaining = null;
          if (isActive) {
            daysRemaining = Math.max(0, endDay - currentDay);
          }
          
          // Format HEX amount (8 decimals)
          const hexAmount = ethers.utils.formatUnits(stakedHearts, 8);
          
          // Calculate estimated interest (for display purposes)
          let interestEarned = "0";
          if (progressPercentage > 0) {
            // Simple interest estimation
            const annualRate = 0.35; // 35% APY (conservative estimate)
            const yearsStaked = stakedDays / 365;
            const estimatedInterestRate = annualRate * yearsStaked * (progressPercentage / 100);
            const principalHex = parseFloat(hexAmount);
            const interestHex = principalHex * estimatedInterestRate;
            interestEarned = interestHex.toFixed(2);
            
            // Add to total interest
            totalInterestBN += parseFloat(interestEarned);
          }
          
          // Add to total staked HEX
          totalHexStakedBN = totalHexStakedBN.add(ethers.BigNumber.from(stakedHearts));
          
          // Calculate USD values for this stake
          const stakeValueUsd = parseFloat(hexAmount) * currentHexPrice;
          const stakeInterestValueUsd = parseFloat(interestEarned) * currentHexPrice;
          const stakeTotalValueUsd = stakeValueUsd + stakeInterestValueUsd;
          
          stakesData.push({
            stakeId,
            stakedHearts,
            stakeShares,
            lockedDay,
            stakedDays,
            unlockedDay,
            isAutoStake,
            lockDate: lockDate.toISOString(),
            unlockDate: unlockDate ? unlockDate.toISOString() : null,
            endDate: endDate.toISOString(),
            isActive,
            progressPercentage,
            hexAmount,
            daysRemaining,
            interestEarned,
            valueUsd: stakeValueUsd,
            interestValueUsd: stakeInterestValueUsd,
            totalValueUsd: stakeTotalValueUsd
          });
        }
        
        // Sort stakes by lock date (newest first)
        stakesData.sort((a, b) => {
          return new Date(b.lockDate).getTime() - new Date(a.lockDate).getTime();
        });
        
        // Format and set state values
        const formattedTotalHexStaked = ethers.utils.formatUnits(totalHexStakedBN, 8);
        const formattedTotalInterest = totalInterestBN.toFixed(2);
        const totalStakePlusInterestValue = (parseFloat(formattedTotalHexStaked) + totalInterestBN).toFixed(2);
        
        // Calculate USD values
        const stakedHexUsd = parseFloat(formattedTotalHexStaked) * currentHexPrice;
        const interestHexUsd = totalInterestBN * currentHexPrice;
        const totalValueUsd = parseFloat(totalStakePlusInterestValue) * currentHexPrice;
        
        setStakes(stakesData);
        setTotalHexStaked(formattedTotalHexStaked);
        setTotalInterest(formattedTotalInterest);
        setTotalStakePlusInterest(totalStakePlusInterestValue);
        setStakedValueUsd(stakedHexUsd);
        setInterestValueUsd(interestHexUsd);
        setTotalValueUsd(totalValueUsd);
        
      } catch (err) {
        console.error('Error fetching HEX stakes:', err);
        setError('Failed to fetch HEX stakes. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchHexStakes();
  }, [walletAddress, chainId]);
  
  // Format date in a user-friendly way
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  // Format USD value with 2 decimal places
  const formatUsd = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return '0.00';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };
  
  // Effect to sort stakes whenever sort criteria or stakes change
  useEffect(() => {
    if (!stakes.length) {
      setSortedStakes([]);
      return;
    }

    const sortStakes = () => {
      const newSortedStakes = [...stakes];
      
      switch (sortBy) {
        case 'newest':
          newSortedStakes.sort((a, b) => new Date(b.lockDate).getTime() - new Date(a.lockDate).getTime());
          break;
        case 'oldest':
          newSortedStakes.sort((a, b) => new Date(a.lockDate).getTime() - new Date(b.lockDate).getTime());
          break;
        case 'amount-desc':
          newSortedStakes.sort((a, b) => parseFloat(b.hexAmount) - parseFloat(a.hexAmount));
          break;
        case 'amount-asc':
          newSortedStakes.sort((a, b) => parseFloat(a.hexAmount) - parseFloat(b.hexAmount));
          break;
        case 'end-date':
          newSortedStakes.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
          break;
        case 'progress':
          newSortedStakes.sort((a, b) => b.progressPercentage - a.progressPercentage);
          break;
        default:
          // Default to newest stakes first
          newSortedStakes.sort((a, b) => new Date(b.lockDate).getTime() - new Date(a.lockDate).getTime());
      }
      
      return newSortedStakes;
    };
    
    setSortedStakes(sortStakes());
  }, [stakes, sortBy]);

  // No network switching needed, we're only focusing on PulseChain now
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[200px] hex-stakes-component">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-white/80">Loading HEX stakes data...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-6 text-center hex-stakes-component">
        <h3 className="text-xl font-bold mb-2 text-red-400">Error Loading Stakes</h3>
        <p className="text-white/70 mb-4">{error}</p>
      </div>
    );
  }
  
  if (stakes.length === 0) {
    return (
      <div className="p-6 text-center hex-stakes-component">
        <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">No HEX Stakes Found</h3>
        <p className="text-white/70 mb-4">This wallet doesn't have any active or historical HEX stakes on PulseChain.</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 hex-stakes-component">
      {/* Network and Overview Section */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg md:text-xl font-semibold text-white">
            <span className="text-white">HEX Stakes</span>
            <span className="ml-2 text-sm text-white/60">({stakeCount})</span>
          </h3>
          <p className="text-xs md:text-sm text-white/70 mt-1">
            Viewing stakes on PulseChain network
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-white/70">Total HEX Staked</div>
            <div className="text-lg font-bold text-white" data-total-staked={totalHexStaked}>
              {formatTokenAmount(parseFloat(totalHexStaked))}
            </div>
            <div className="text-xs text-gray-400">${formatUsd(stakedValueUsd)}</div>
          </div>
          
          <div className="text-right">
            <div className="text-sm text-white/70">Total Interest</div>
            <div className="text-lg font-bold text-white" data-total-interest={totalInterest}>
              +{formatTokenAmount(parseFloat(totalInterest))}
            </div>
            <div className="text-xs text-gray-400">+${formatUsd(interestValueUsd)}</div>
          </div>
          
          <div className="text-right">
            <div className="text-sm text-white/70">Total Stake + Interest</div>
            <div className="text-lg font-bold bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-600 bg-clip-text text-transparent"
                 data-total-combined={totalStakePlusInterest}>
              {formatTokenAmount(parseFloat(totalStakePlusInterest))}
            </div>
            <div className="text-xs text-gray-400">${formatUsd(totalValueUsd)}</div>
          </div>
        </div>
      </div>
      
      {/* Sorting Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-white/70">
          Sort by:
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button 
            onClick={() => setSortBy('newest')}
            className={`px-3 py-1 rounded-md text-xs ${
              sortBy === 'newest' 
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 font-semibold' 
                : 'bg-black/20 text-white/70 border border-white/10 hover:border-white/30'
            }`}
          >
            Newest First
          </button>
          <button 
            onClick={() => setSortBy('oldest')}
            className={`px-3 py-1 rounded-md text-xs ${
              sortBy === 'oldest' 
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 font-semibold' 
                : 'bg-black/20 text-white/70 border border-white/10 hover:border-white/30'
            }`}
          >
            Oldest First
          </button>
          <button 
            onClick={() => setSortBy('amount-desc')}
            className={`px-3 py-1 rounded-md text-xs ${
              sortBy === 'amount-desc' 
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 font-semibold' 
                : 'bg-black/20 text-white/70 border border-white/10 hover:border-white/30'
            }`}
          >
            Largest Amount
          </button>
          <button 
            onClick={() => setSortBy('end-date')}
            className={`px-3 py-1 rounded-md text-xs ${
              sortBy === 'end-date' 
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 font-semibold' 
                : 'bg-black/20 text-white/70 border border-white/10 hover:border-white/30'
            }`}
          >
            End Date (Earliest)
          </button>
          <button 
            onClick={() => setSortBy('progress')}
            className={`px-3 py-1 rounded-md text-xs ${
              sortBy === 'progress' 
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 font-semibold' 
                : 'bg-black/20 text-white/70 border border-white/10 hover:border-white/30'
            }`}
          >
            Progress
          </button>
        </div>
      </div>
      
      {/* Stakes List */}
      <div className="space-y-4">
        {sortedStakes.map((stake, index) => (
          <Card key={`stake-${stake.stakeId}-${index}`} className="p-4 border-white/10 glass-card stake-item">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Left side - Stake Details */}
              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-purple-600/20 text-purple-300 px-2 py-1 rounded-md text-xs font-semibold border border-purple-600/30">
                      Stake ID: {stake.stakeId}
                    </div>
                    <div className={`px-2 py-1 rounded-md text-xs font-semibold ${
                      stake.isActive 
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30' 
                        : 'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                    }`}>
                      {stake.isActive ? 'Active' : 'Ended'}
                    </div>
                  </div>
                  <div className="mt-2 md:mt-0 text-right">
                    <div className="text-white font-bold">
                      {formatTokenAmount(parseFloat(stake.hexAmount))} HEX
                    </div>
                    {stake.valueUsd !== undefined && (
                      <div className="text-xs text-gray-400">
                        ${formatUsd(stake.valueUsd)}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                  <div>
                    <div className="text-xs text-white/50">Start Date</div>
                    <div className="text-sm text-white">{formatDate(stake.lockDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">End Date</div>
                    <div className="text-sm text-white">{formatDate(stake.endDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">Term Length</div>
                    <div className="text-sm text-white">{stake.stakedDays} days</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50">{stake.isActive ? 'Days Remaining' : 'Completed'}</div>
                    <div className="text-sm text-white">
                      {stake.isActive 
                        ? (stake.daysRemaining !== null ? `${stake.daysRemaining} days` : 'Calculating...') 
                        : 'Stake completed'}
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-xs text-white/60">Progress</div>
                    <div className="text-xs font-medium text-white/80">{stake.progressPercentage}%</div>
                  </div>
                  <Progress 
                    value={stake.progressPercentage} 
                    className="h-2" 
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  />
                </div>
              </div>
              
              {/* Right side - Estimated Earnings */}
              <div className="md:w-64 p-3 bg-black/20 rounded-md border border-white/5">
                <div className="text-center mb-2">
                  <div className="text-xs text-white/60">
                    {stake.isActive ? 'Estimated Earnings' : 'Final Earnings'}
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-600 bg-clip-text text-transparent">
                    +{formatTokenAmount(parseFloat(stake.interestEarned || '0'))} HEX
                  </div>
                  {stake.isActive && (
                    <div className="text-xs text-white/50 mt-1">
                      Based on current progress ({stake.progressPercentage}%)
                    </div>
                  )}
                </div>
                
                {stake.isActive && stake.daysRemaining !== null && stake.daysRemaining > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 text-center">
                    <div className="text-xs text-white/60 mb-1">
                      Estimated Completion
                    </div>
                    <div className="text-sm font-medium text-white/80">
                      {new Date(Date.now() + (stake.daysRemaining * 24 * 60 * 60 * 1000)).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}