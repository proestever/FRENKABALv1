import React, { useEffect, useState } from 'react';
import { useLoadingProgress } from '@/hooks/use-loading-progress';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle, Wallet, Coins, TrendingUp, Database, Shield, Activity } from 'lucide-react';

interface LoadingProgressProps {
  isLoading: boolean;
  walletAddress?: string;
  customProgress?: {
    currentBatch: number;
    totalBatches: number;
    status: 'idle' | 'loading' | 'complete' | 'error';
    message: string;
  };
}

// Color mapping for stages
const STAGE_COLORS = {
  purple: 'bg-purple-500/30 border-purple-400 shadow-purple-500/20 text-purple-300',
  blue: 'bg-blue-500/30 border-blue-400 shadow-blue-500/20 text-blue-300',
  green: 'bg-green-500/30 border-green-400 shadow-green-500/20 text-green-300',
  yellow: 'bg-yellow-500/30 border-yellow-400 shadow-yellow-500/20 text-yellow-300',
  pink: 'bg-pink-500/30 border-pink-400 shadow-pink-500/20 text-pink-300',
  indigo: 'bg-indigo-500/30 border-indigo-400 shadow-indigo-500/20 text-indigo-300',
  emerald: 'bg-emerald-500/30 border-emerald-400 shadow-emerald-500/20 text-emerald-300'
};

// Define loading stages with weights
const LOADING_STAGES = [
  { id: 'connect', label: 'Connecting to PulseChain', icon: Activity, weight: 5, duration: 800, color: 'purple' },
  { id: 'wallet', label: 'Fetching wallet data', icon: Wallet, weight: 10, duration: 1500, color: 'blue' },
  { id: 'tokens', label: 'Loading token balances', icon: Coins, weight: 30, duration: 4000, color: 'green' },
  { id: 'prices', label: 'Fetching token prices', icon: TrendingUp, weight: 25, duration: 3000, color: 'yellow' },
  { id: 'lp', label: 'Analyzing LP tokens', icon: Database, weight: 15, duration: 2000, color: 'pink' },
  { id: 'verify', label: 'Verifying token contracts', icon: Shield, weight: 10, duration: 1200, color: 'indigo' },
  { id: 'complete', label: 'Finalizing data', icon: CheckCircle, weight: 5, duration: 500, color: 'emerald' }
];

export function LoadingProgress({ isLoading, walletAddress, customProgress }: LoadingProgressProps) {
  // If customProgress is provided, use it, otherwise fetch from server
  const serverProgress = useLoadingProgress(isLoading && !customProgress);
  const progress = customProgress || serverProgress;
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [prevMessage, setPrevMessage] = useState('');
  const [stageTransition, setStageTransition] = useState(false);
  const [hideDelay, setHideDelay] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [stageStartTime, setStageStartTime] = useState(Date.now());
  
  // Enhanced progress calculation based on stages
  const calculateProgressFromStages = () => {
    if (progress.status === 'complete') return 100;
    if (progress.status === 'idle') return 0;
    
    // Calculate cumulative weights
    let totalWeight = 0;
    let completedWeight = 0;
    
    LOADING_STAGES.forEach((stage, index) => {
      totalWeight += stage.weight;
      if (index < currentStageIndex) {
        completedWeight += stage.weight;
      } else if (index === currentStageIndex) {
        // Calculate progress within current stage based on time
        const elapsedTime = Date.now() - stageStartTime;
        const stageProgress = Math.min(elapsedTime / stage.duration, 1);
        completedWeight += stage.weight * stageProgress;
      }
    });
    
    return Math.min(Math.round((completedWeight / totalWeight) * 100), 99);
  };
  
  // Update stage based on progress percentage
  useEffect(() => {
    // Map percentage ranges to stages
    const percentageToStage = (percent: number): number => {
      if (percent < 10) return 0;      // Connecting
      if (percent < 20) return 1;      // Fetching wallet
      if (percent < 50) return 2;      // Loading tokens
      if (percent < 65) return 3;      // Fetching prices
      if (percent < 80) return 4;      // Analyzing LP
      if (percent < 95) return 5;      // Verifying
      if (percent < 100) return 6;     // Finalizing
      return 6;                        // Complete
    };
    
    // When using percentage-based progress
    if (progress.totalBatches === 100) {
      const newStageIndex = percentageToStage(progress.currentBatch);
      if (newStageIndex !== currentStageIndex) {
        setCurrentStageIndex(newStageIndex);
        setStageStartTime(Date.now());
      }
    } else {
      // Fallback to message-based stage detection
      const messageToStage: Record<string, number> = {
        'Connecting to PulseChain network...': 0,
        'Fetching wallet data...': 1,
        'Loading token balances...': 2,
        'Fetching token prices...': 3,
        'Analyzing LP tokens...': 4,
        'Verifying token contracts...': 5,
        'Processing complete': 6
      };
      
      for (const [msg, stageIdx] of Object.entries(messageToStage)) {
        if (progress.message.includes(msg.substring(0, 20))) {
          if (stageIdx !== currentStageIndex) {
            setCurrentStageIndex(stageIdx);
            setStageStartTime(Date.now());
          }
          break;
        }
      }
    }
  }, [progress.message, progress.currentBatch, progress.totalBatches, currentStageIndex]);
  
  // Calculate the progress percentage
  const progressPercent = progress.status === 'complete' 
    ? 100  // Always show 100% when complete
    : progress.totalBatches === 100 
      ? Math.min(progress.currentBatch, 99)  // Cap at 99% until complete
      : progress.totalBatches > 0 
        ? Math.min(Math.round((progress.currentBatch / progress.totalBatches) * 100), 99)
        : calculateProgressFromStages();
  
  // Handle message transitions with animation
  useEffect(() => {
    if (progress.message !== prevMessage) {
      setStageTransition(true);
      const timer = setTimeout(() => {
        setPrevMessage(progress.message);
        setStageTransition(false);
      }, 300); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [progress.message, prevMessage]);
  
  // Improved smooth animation for progress updates
  useEffect(() => {
    // If the actual progress is ahead of our animated progress, gradually catch up
    if (progressPercent > animatedProgress) {
      // Use a more refined approach for smoother animation
      const step = Math.max(1, Math.floor((progressPercent - animatedProgress) / 10));
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          const next = Math.min(prev + step, progressPercent);
          if (next >= progressPercent) {
            clearInterval(interval);
            return progressPercent;
          }
          return next;
        });
      }, 40); // Slightly slower for more visible progress
      
      return () => clearInterval(interval);
    } else if (progressPercent < animatedProgress) {
      // If progress went backward (rare case), snap directly to new value
      setAnimatedProgress(progressPercent);
    }
  }, [progressPercent, animatedProgress]);
  
  // Add a delay before hiding the loading progress after completion
  useEffect(() => {
    if (progress.status === 'complete' && !hideDelay) {
      // If status becomes complete, set a timer to hide the progress after a delay
      const timer = setTimeout(() => {
        setHideDelay(true);
      }, 1500); // Keep the progress visible for 1.5 seconds after completion
      return () => clearTimeout(timer);
    }
    
    // Reset hideDelay when loading starts again
    if (isLoading && progress.status === 'loading' && hideDelay) {
      setHideDelay(false);
    }
  }, [progress.status, isLoading, hideDelay]);
  
  // Check loading state and progress conditions
  // Only show when:
  // 1. We are currently loading (isLoading is true)
  // 2. We have a meaningful progress state (not idle)
  // 3. If loading complete, only show during the delay period
  const shouldShow = isLoading && 
                    progress.status !== 'idle' && 
                    (progress.status !== 'complete' || !hideDelay);
  
  // Only show for initial loading, not background operations
  if (!isLoading || progress.status === 'idle') {
    return null;
  }
  
  // Determine the icon based on status
  const StatusIcon = () => {
    switch (progress.status) {
      case 'loading':
        return <Loader2 className="h-5 w-5 animate-spin text-white" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-md bg-black/40">
      <Card className="p-6 glass-card border-white/15 backdrop-blur-md shadow-lg w-4/5 max-w-3xl">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon />
              <div>
                <h3 className="text-lg font-bold text-white">
                  {progress.status === 'loading' ? 'Loading wallet data' : 
                   progress.status === 'complete' ? 'Loading complete' : 
                   'Error loading data'}
                </h3>
                {walletAddress && (
                  <p className="text-xs text-muted-foreground">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{animatedProgress}%</span>
              {progress.currentBatch > 0 && (
                <p className="text-xs text-muted-foreground">
                  Batch {progress.currentBatch}/{progress.totalBatches}
                </p>
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          <Progress 
            value={animatedProgress} 
            className="h-4 bg-black/30 relative overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '6px'
            }}
            indicator={
              <div 
                className="h-full w-full absolute progress-shimmer animate-pulse-subtle"
                style={{
                  background: 'linear-gradient(90deg, #FFEA00 0%, #FF9800 15%, #FF5722 30%, #F50057 50%, #D500F9 70%, #651FFF 85%, #3D5AFE 100%)',
                  width: `${animatedProgress}%`,
                  transform: 'none',
                  transition: 'width 200ms cubic-bezier(0.65, 0, 0.35, 1)',
                  boxShadow: '0 0 10px rgba(255,80,120,0.7), 0 0 15px rgba(255,80,120,0.3)',
                  backgroundSize: '200% 100%',
                  borderRadius: '6px'
                }}
              />
            }
          />
          
          {/* Loading Stages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {LOADING_STAGES.map((stage, index) => {
              const Icon = stage.icon;
              const isActive = index === currentStageIndex && progress.status !== 'complete';
              const isCompleted = false; // Don't show completed state
              const isPending = index !== currentStageIndex || progress.status === 'complete';
              
              return (
                <div 
                  key={stage.id}
                  className={`flex items-center gap-2 p-2 rounded-md transition-all duration-500 ${
                    isActive ? `${STAGE_COLORS[stage.color as keyof typeof STAGE_COLORS]} border-2 shadow-lg scale-105` :
                    'bg-white/5 border border-white/10 opacity-40'
                  }`}
                >
                  <Icon 
                    size={18} 
                    className={`transition-all duration-500 ${
                      isActive ? 'animate-pulse scale-110' :
                      'text-gray-500'
                    }`}
                  />
                  <span className={`text-xs font-medium transition-all duration-500 ${
                    isActive ? 'text-white font-semibold' :
                    'text-gray-400'
                  }`}>
                    {stage.label}
                  </span>
                  {isActive && <Loader2 size={14} className="ml-auto animate-spin" />}
                </div>
              );
            })}
          </div>
          
          {/* Current Operation */}
          <div className="relative h-8 overflow-hidden border-t border-white/10 pt-2">
            <p 
              className={`text-sm text-center text-muted-foreground transition-all duration-300 ${
                stageTransition ? 'opacity-0 transform -translate-y-2' : 'opacity-100'
              }`}
            >
              {progress.message || LOADING_STAGES[currentStageIndex]?.label || 'Initializing...'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}