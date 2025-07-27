import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { PerformanceTimer } from "@/utils/performance-timer";

interface TimingEntry {
  name: string;
  duration: number;
  status: 'running' | 'complete' | 'error';
  metadata?: any;
}

interface PerformanceDisplayProps {
  timer?: PerformanceTimer;
  visible?: boolean;
}

export function PerformanceDisplay({ timer, visible = true }: PerformanceDisplayProps) {
  const [timings, setTimings] = useState<TimingEntry[]>([]);
  const [activeOperations, setActiveOperations] = useState<string[]>([]);

  useEffect(() => {
    if (!timer || !visible) return;

    const updateInterval = setInterval(() => {
      const entries = timer.getTimings();
      const formatted: TimingEntry[] = [];
      const active: string[] = [];

      entries.forEach((entry: any) => {
        if (entry.endTime) {
          formatted.push({
            name: entry.name,
            duration: entry.endTime - entry.startTime,
            status: 'complete',
            metadata: entry.metadata
          });
        } else {
          const duration = Date.now() - entry.startTime;
          formatted.push({
            name: entry.name,
            duration,
            status: 'running',
            metadata: entry.metadata
          });
          active.push(entry.name);
        }
      });

      setTimings(formatted);
      setActiveOperations(active);
    }, 100);

    return () => clearInterval(updateInterval);
  }, [timer, visible]);

  if (!visible || timings.length === 0) return null;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatOperationName = (name: string): string => {
    // Make operation names more user-friendly
    return name
      .replace(/_/g, ' ')
      .replace(/wallet 0x[a-f0-9]+/i, (match) => `Wallet ${match.slice(-6)}...`)
      .replace(/batch (\d+)/i, 'Batch $1')
      .replace(/hex stakes/i, 'HEX Stakes')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Calculate total elapsed time
  const totalElapsed = timings.reduce((max, entry) => 
    Math.max(max, entry.duration), 0
  );

  // Sort timings by duration (longest first) for completed operations
  const sortedTimings = [...timings].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (a.status !== 'running' && b.status === 'running') return 1;
    return b.duration - a.duration;
  });

  return (
    <Card className="w-full max-w-2xl mx-auto mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 animate-pulse" />
          Performance Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Total Elapsed Time</span>
            <span className="font-mono">{formatDuration(totalElapsed)}</span>
          </div>
          <Progress value={activeOperations.length === 0 ? 100 : 50} className="h-2" />
        </div>

        {/* Active operations */}
        {activeOperations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Active Operations</h4>
            {sortedTimings
              .filter(t => t.status === 'running')
              .map((timing, idx) => (
                <div key={`${timing.name}-${idx}`} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md">
                  <Clock className="h-4 w-4 animate-spin text-primary" />
                  <span className="flex-1 text-sm">{formatOperationName(timing.name)}</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    {formatDuration(timing.duration)}
                  </span>
                </div>
              ))
            }
          </div>
        )}

        {/* Completed operations (top 5) */}
        {sortedTimings.filter(t => t.status === 'complete').length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Completed Operations</h4>
            {sortedTimings
              .filter(t => t.status === 'complete')
              .slice(0, 5)
              .map((timing, idx) => (
                <div key={`${timing.name}-${idx}`} className="flex items-center gap-3 p-2 rounded-md">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="flex-1 text-sm text-muted-foreground">
                    {formatOperationName(timing.name)}
                  </span>
                  <span className="text-sm font-mono">
                    {formatDuration(timing.duration)}
                  </span>
                </div>
              ))
            }
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold">{timings.length}</div>
            <div className="text-xs text-muted-foreground">Total Operations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              {timings.filter(t => t.status === 'complete').length}
            </div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {activeOperations.length}
            </div>
            <div className="text-xs text-muted-foreground">Running</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}