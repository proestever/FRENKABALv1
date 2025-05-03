import React, { useEffect, useState } from 'react';
import { useLoadingProgress } from '@/hooks/use-loading-progress';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface LoadingProgressProps {
  isLoading: boolean;
}

export function LoadingProgress({ isLoading }: LoadingProgressProps) {
  const progress = useLoadingProgress(isLoading);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  // Calculate the progress percentage
  const progressPercent = progress.status === 'complete' 
    ? 100 
    : progress.totalBatches > 0 
      ? Math.min(Math.round((progress.currentBatch / progress.totalBatches) * 100), 100)
      : 0;
  
  // Smooth animation for progress updates
  useEffect(() => {
    // If the actual progress is ahead of our animated progress, gradually catch up
    if (progressPercent > animatedProgress) {
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          const next = prev + 1;
          if (next >= progressPercent) {
            clearInterval(interval);
            return progressPercent;
          }
          return next;
        });
      }, 20); // Update every 20ms for smooth animation
      
      return () => clearInterval(interval);
    } else if (progressPercent < animatedProgress) {
      // If progress went backward (rare case), snap directly to new value
      setAnimatedProgress(progressPercent);
    }
  }, [progressPercent, animatedProgress]);
  
  // Check loading state and progress - only hide if we're not loading or if we're idle with no batches
  const shouldShow = isLoading && (progress.status !== 'idle' || progress.totalBatches > 0);
  
  // Don't show anything if not in loading state
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
    <Card className="p-4 mb-4 glass-card border-white/15 backdrop-blur-md shadow-lg">
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
            Batch {progress.currentBatch}/{progress.totalBatches}
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
              className="h-full w-full absolute progress-shimmer"
              style={{
                background: 'linear-gradient(90deg, #FFEA00 0%, #FF9800 15%, #FF5722 30%, #F50057 50%, #D500F9 70%, #651FFF 85%, #3D5AFE 100%)',
                transform: `translateX(-${100 - animatedProgress}%)`,
                transition: 'transform 120ms cubic-bezier(0.65, 0, 0.35, 1)',
                boxShadow: '0 0 10px rgba(255,80,120,0.7)'
              }}
            />
          }
        />
        
        <p className="text-xs text-muted-foreground mt-1">
          {progress.message}
        </p>
      </div>
    </Card>
  );
}