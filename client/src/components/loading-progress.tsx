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

// Define loading stages with weights
const LOADING_STAGES = [
  { id: 'connect', label: 'Connecting to blockchain', icon: Activity, weight: 5, duration: 800 },
  { id: 'wallet', label: 'Fetching wallet information', icon: Wallet, weight: 10, duration: 1500 },
  { id: 'tokens', label: 'Scanning token balances', icon: Coins, weight: 30, duration: 4000 },
  { id: 'prices', label: 'Retrieving token prices', icon: TrendingUp, weight: 25, duration: 3000 },
  { id: 'lp', label: 'Analyzing LP positions', icon: Database, weight: 15, duration: 2000 },
  { id: 'verify', label: 'Verifying contract data', icon: Shield, weight: 10, duration: 1200 },
  { id: 'complete', label: 'Finalizing data', icon: CheckCircle, weight: 5, duration: 500 }
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
  
  // Update stage based on progress message
  useEffect(() => {
    const messageToStage: Record<string, number> = {
      'Connecting to PulseChain network...': 0,
      'Fetching wallet data...': 1,
      'Loading token balances...': 2,
      'Fetching token prices...': 3,
      'Analyzing LP tokens...': 4,
      'Verifying token contracts...': 5,
      'Processing complete': 6
    };
    
    // Check if message matches any stage
    for (const [msg, stageIdx] of Object.entries(messageToStage)) {
      if (progress.message.includes(msg.substring(0, 20))) {
        if (stageIdx !== currentStageIndex) {
          setCurrentStageIndex(stageIdx);
          setStageStartTime(Date.now());
        }
        break;
      }
    }
  }, [progress.message, currentStageIndex]);
  
  // Calculate the progress percentage based on stages or batches
  const progressPercent = progress.totalBatches > 0 
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
              const isActive = index === currentStageIndex;
              const isCompleted = index < currentStageIndex || (progress.status === 'complete' && index === LOADING_STAGES.length - 1);
              const isPending = index > currentStageIndex && progress.status !== 'complete';
              
              return (
                <div 
                  key={stage.id}
                  className={`flex items-center gap-2 p-2 rounded-md transition-all duration-300 ${
                    isActive ? 'bg-purple-500/20 border border-purple-500/30' :
                    isCompleted ? 'bg-green-500/10 border border-green-500/20' :
                    'bg-white/5 border border-white/10 opacity-50'
                  }`}
                >
                  <Icon 
                    size={16} 
                    className={`${
                      isActive ? 'text-purple-400 animate-pulse' :
                      isCompleted ? 'text-green-400' :
                      'text-gray-500'
                    }`}
                  />
                  <span className={`text-xs font-medium ${
                    isActive ? 'text-white' :
                    isCompleted ? 'text-green-300' :
                    'text-gray-400'
                  }`}>
                    {stage.label}
                  </span>
                  {isCompleted && <CheckCircle size={14} className="ml-auto text-green-400" />}
                  {isActive && <Loader2 size={14} className="ml-auto text-purple-400 animate-spin" />}
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