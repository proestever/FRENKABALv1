import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, CheckCircle2, AlertCircle, Wallet, Coins, TrendingUp, Shield, Activity, Package } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLoadingProgress } from '@/hooks/use-loading-progress';
import { cn } from '@/lib/utils';

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

// Loading stages in sequential order
const LOADING_STAGES = [
  { id: 'connect', name: 'Connecting', icon: Activity },
  { id: 'wallet', name: 'Wallet Data', icon: Wallet },
  { id: 'tokens', name: 'Token Balances', icon: Coins },
  { id: 'prices', name: 'Price Data', icon: TrendingUp },
  { id: 'lp', name: 'LP Analysis', icon: Package },
  { id: 'verify', name: 'Verification', icon: Shield }
];

export function LoadingProgress({ isLoading, walletAddress, customProgress }: LoadingProgressProps) {
  const serverProgress = useLoadingProgress(isLoading && !customProgress);
  const progress = customProgress || serverProgress;
  
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [hideDelay, setHideDelay] = useState(false);
  
  // Update stage based on progress percentage
  useEffect(() => {
    if (progress.status === 'loading' && progress.totalBatches === 100) {
      // Map percentage to stage index
      const percent = progress.currentBatch;
      let stageIndex = 0;
      
      if (percent >= 10) stageIndex = 1;  // Wallet Data
      if (percent >= 20) stageIndex = 2;  // Token Balances
      if (percent >= 50) stageIndex = 3;  // Price Data
      if (percent >= 65) stageIndex = 4;  // LP Analysis
      if (percent >= 80) stageIndex = 5;  // Verification
      
      setCurrentStageIndex(stageIndex);
    } else if (progress.status === 'complete') {
      setCurrentStageIndex(LOADING_STAGES.length); // All complete
    } else if (progress.status === 'idle') {
      setCurrentStageIndex(0);
    }
  }, [progress.currentBatch, progress.totalBatches, progress.status]);
  
  // Manage completion delay
  useEffect(() => {
    if (progress.status === 'complete' && !hideDelay) {
      const timer = setTimeout(() => {
        setHideDelay(true);
      }, 2000); // Keep visible for 2 seconds after completion
      return () => clearTimeout(timer);
    }
    
    // Reset hideDelay when loading starts again
    if (isLoading && progress.status === 'loading' && hideDelay) {
      setHideDelay(false);
    }
  }, [progress.status, isLoading, hideDelay]);
  
  const shouldShow = isLoading && 
                    progress.status !== 'idle' && 
                    (progress.status !== 'complete' || !hideDelay);
  
  if (!isLoading || progress.status === 'idle') {
    return null;
  }
  
  return (
    <Dialog open={shouldShow}>
      <DialogContent className="sm:max-w-md bg-gradient-to-b from-gray-900 to-black border-gray-800">
        {/* Hidden title for accessibility */}
        <div className="sr-only">
          <h2>Loading Progress</h2>
        </div>
        <div className="flex flex-col items-center space-y-6 py-4">
          {/* Loading animation */}
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg">
              {progress.status === 'complete' ? (
                <CheckCircle2 className="h-8 w-8 text-white" />
              ) : (
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              )}
            </div>
          </div>
          
          {/* Wallet address */}
          {walletAddress && (
            <div className="text-center">
              <p className="text-sm text-gray-400">Analyzing wallet</p>
              <p className="font-mono text-xs text-gray-500 mt-1">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
            </div>
          )}
          
          {/* Stage badges */}
          <div className="w-full space-y-2">
            <div className="flex flex-wrap gap-2 justify-center">
              {LOADING_STAGES.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isCompleted = index < currentStageIndex;
                const Icon = stage.icon;
                
                return (
                  <motion.div
                    key={stage.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ 
                      opacity: 1,
                      scale: isActive ? 1.05 : 1,
                    }}
                    transition={{ 
                      duration: 0.3,
                      delay: index * 0.05
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
                      isCompleted && "bg-green-500/20 text-green-400 border border-green-500/30",
                      isActive && "bg-blue-500/30 text-blue-400 border border-blue-500/50 shadow-lg shadow-blue-500/20",
                      !isActive && !isCompleted && "bg-gray-800/50 text-gray-500 border border-gray-700/50"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : isActive ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    <span>{stage.name}</span>
                  </motion.div>
                );
              })}
            </div>
            
            {/* Status message */}
            <AnimatePresence mode="wait">
              <motion.div
                key={progress.message}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mt-4 text-center"
              >
                <p className="text-sm text-gray-400">
                  {progress.status === 'complete' ? 'Analysis complete!' : progress.message}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}