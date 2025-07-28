import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface SimpleProgressProps {
  isLoading: boolean;
  walletAddress?: string;
  percentage?: number;
  message?: string;
  status?: 'idle' | 'loading' | 'complete' | 'error';
}

export function SimpleProgress({ 
  isLoading, 
  walletAddress, 
  percentage = 0, 
  message = 'Loading...', 
  status = 'loading' 
}: SimpleProgressProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Animate progress changes
  useEffect(() => {
    if (percentage !== animatedProgress) {
      const timer = setTimeout(() => {
        setAnimatedProgress(percentage);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [percentage, animatedProgress]);

  if (!isLoading) return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-md bg-black/40">
      <Card className="p-6 glass-card border-white/15 backdrop-blur-md shadow-lg w-4/5 max-w-2xl">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <h3 className="text-lg font-bold text-white">
                  {status === 'loading' ? 'Loading wallet data' : 
                   status === 'complete' ? 'Loading complete' : 
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
              <span className="text-2xl font-bold text-white">{Math.round(animatedProgress)}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress 
              value={animatedProgress} 
              className="h-3 bg-white/10"
            />
            
            {/* Status Message */}
            <p className="text-sm text-muted-foreground text-center">
              {message}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}