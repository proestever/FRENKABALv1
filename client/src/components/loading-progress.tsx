import React from 'react';
import { useLoadingProgress } from '@/hooks/use-loading-progress';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface LoadingProgressProps {
  isLoading: boolean;
}

export function LoadingProgress({ isLoading }: LoadingProgressProps) {
  const progress = useLoadingProgress(isLoading);
  
  // Don't show anything if we're not loading or if there are no batches to process
  if (!isLoading || progress.status === 'idle' || progress.totalBatches === 0) {
    return null;
  }
  
  // Calculate the progress percentage
  const progressPercent = progress.totalBatches > 0 
    ? Math.min(Math.round((progress.currentBatch / progress.totalBatches) * 100), 100)
    : 0;
  
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
    <Card className="p-4 mb-4 border border-border bg-card/90 backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon />
            <h3 className="text-sm font-medium">
              {progress.status === 'loading' ? 'Loading...' : 
               progress.status === 'complete' ? 'Complete' : 
               'Error'}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {progress.currentBatch}/{progress.totalBatches} batches
          </span>
        </div>
        
        <Progress value={progressPercent} className="h-2" />
        
        <p className="text-xs text-muted-foreground">
          {progress.message}
        </p>
      </div>
    </Card>
  );
}