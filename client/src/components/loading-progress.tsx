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
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };
  
  return (
    <Card className="p-4 mb-4 border border-border bg-card/90 backdrop-blur-sm shadow-lg">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon />
            <h3 className="text-sm font-medium">
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
          className="h-2 bg-muted/50"
          // Add gradient effect to progress bar
          style={{
            background: 'linear-gradient(90deg, rgba(139,92,246,0.2) 0%, rgba(79,70,229,0.2) 100%)'
          }}
        />
        
        <p className="text-xs text-muted-foreground mt-1">
          {progress.message}
        </p>
      </div>
    </Card>
  );
}