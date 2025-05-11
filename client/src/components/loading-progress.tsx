import React, { useEffect, useState } from 'react';
import { useLoadingProgress } from '@/hooks/use-loading-progress';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface LoadingProgressProps {
  isLoading: boolean;
  customProgress?: {
    currentBatch: number;
    totalBatches: number;
    status: 'idle' | 'loading' | 'complete' | 'error';
    message: string;
  };
}

export function LoadingProgress({ isLoading, customProgress }: LoadingProgressProps) {
  // If customProgress is provided, use it, otherwise fetch from server
  const serverProgress = useLoadingProgress(isLoading && !customProgress);
  const progress = customProgress || serverProgress;
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [prevMessage, setPrevMessage] = useState('');
  const [stageTransition, setStageTransition] = useState(false);
  
  // Calculate the progress percentage based on batches or artificial progress
  const progressPercent = progress.status === 'complete' 
    ? 100 
    : progress.totalBatches > 0 
      ? Math.min(Math.round((progress.currentBatch / progress.totalBatches) * 100), 99) // Cap at 99% until complete
      : 0;
  
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
  
  // Check loading state and progress - hide if we're not loading, if we're idle with no batches, or if status is complete
  const shouldShow = isLoading && 
                    (progress.status !== 'idle' || progress.totalBatches > 0) && 
                    progress.status !== 'complete';
  
  // Don't show anything if not in loading state or if complete
  if (!shouldShow) {
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
      <Card className="p-4 glass-card border-white/15 backdrop-blur-md shadow-lg w-4/5 max-w-2xl">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon />
              <h3 className="text-sm font-bold text-white">
                {progress.status === 'loading' ? 'Loading wallet data...' : 
                 progress.status === 'complete' ? 'Loading complete' : 
                 'Error loading data'}
              </h3>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {progress.currentBatch > 0 ? `Wallet ${progress.currentBatch}/${progress.totalBatches}` : 'Initializing...'}
            </span>
          </div>
          
          <Progress 
            value={animatedProgress} 
            className="h-3 bg-black/30 relative overflow-hidden"
            // Add dark background for the progress bar
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '4px'
            }}
            // Add bright HEX gradient indicator
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
                  borderRadius: '4px'
                }}
              />
            }
          />
          
          <div className="relative h-6 overflow-hidden">
            <p 
              className={`text-xs text-muted-foreground mt-1 transition-all duration-300 ${
                stageTransition ? 'opacity-0 transform -translate-y-2' : 'opacity-100'
              }`}
            >
              {progress.message}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}