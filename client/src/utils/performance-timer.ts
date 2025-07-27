/**
 * Performance timing utility for tracking wallet and portfolio loading performance
 */

export interface TimerEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  children?: TimerEntry[];
}

export interface TimerSummary {
  totalDuration: number;
  taskBreakdown: Array<{
    name: string;
    duration: number;
    percentage: number;
    metadata?: Record<string, any>;
  }>;
  slowestTasks: Array<{
    name: string;
    duration: number;
    metadata?: Record<string, any>;
  }>;
}

export class PerformanceTimer {
  private timers: Map<string, TimerEntry> = new Map();
  private completedTimers: TimerEntry[] = [];
  private startTime: number;
  private onUpdate?: (timers: TimerEntry[], summary: TimerSummary) => void;

  constructor(onUpdate?: (timers: TimerEntry[], summary: TimerSummary) => void) {
    this.startTime = performance.now();
    this.onUpdate = onUpdate;
  }

  /**
   * Start a new timer
   */
  start(name: string, metadata?: Record<string, any>): void {
    const timer: TimerEntry = {
      name,
      startTime: performance.now(),
      metadata
    };
    this.timers.set(name, timer);
    console.log(`[TIMER START] ${name}`, metadata || '');
  }

  /**
   * End a timer and record its duration
   */
  end(name: string, additionalMetadata?: Record<string, any>): number {
    const timer = this.timers.get(name);
    if (!timer) {
      console.warn(`Timer "${name}" not found`);
      return 0;
    }

    timer.endTime = performance.now();
    timer.duration = timer.endTime - timer.startTime;
    
    if (additionalMetadata) {
      timer.metadata = { ...timer.metadata, ...additionalMetadata };
    }

    this.timers.delete(name);
    this.completedTimers.push(timer);

    const durationMs = Math.round(timer.duration);
    const durationSec = (timer.duration / 1000).toFixed(2);
    console.log(`[TIMER END] ${name}: ${durationMs}ms (${durationSec}s)`, timer.metadata || '');

    // Trigger update callback with current state
    if (this.onUpdate) {
      this.onUpdate(this.getCompletedTimers(), this.getSummary());
    }

    return timer.duration;
  }

  /**
   * Start a child timer (for nested timing)
   */
  startChild(parentName: string, childName: string, metadata?: Record<string, any>): void {
    const fullName = `${parentName}::${childName}`;
    this.start(fullName, { parent: parentName, ...metadata });
  }

  /**
   * End a child timer
   */
  endChild(parentName: string, childName: string, additionalMetadata?: Record<string, any>): number {
    const fullName = `${parentName}::${childName}`;
    return this.end(fullName, additionalMetadata);
  }

  /**
   * Measure an async operation
   */
  async measure<T>(name: string, operation: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    this.start(name, metadata);
    try {
      const result = await operation();
      this.end(name, { success: true });
      return result;
    } catch (error) {
      this.end(name, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get all completed timers
   */
  getCompletedTimers(): TimerEntry[] {
    return [...this.completedTimers];
  }

  /**
   * Get a summary of all timings
   */
  getSummary(): TimerSummary {
    const totalDuration = performance.now() - this.startTime;
    
    // Group timers by parent
    const rootTimers = this.completedTimers.filter(t => !t.metadata?.parent);
    
    // Calculate task breakdown
    const taskBreakdown = rootTimers.map(timer => ({
      name: timer.name,
      duration: timer.duration || 0,
      percentage: ((timer.duration || 0) / totalDuration) * 100,
      metadata: timer.metadata
    }));

    // Find slowest tasks
    const slowestTasks = [...this.completedTimers]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map(timer => ({
        name: timer.name,
        duration: timer.duration || 0,
        metadata: timer.metadata
      }));

    return {
      totalDuration,
      taskBreakdown,
      slowestTasks
    };
  }

  /**
   * Log a detailed summary to console
   */
  logSummary(): void {
    const summary = this.getSummary();
    const totalSec = (summary.totalDuration / 1000).toFixed(2);
    
    console.group(`[PERFORMANCE SUMMARY] Total time: ${totalSec}s`);
    
    console.group('Task Breakdown:');
    summary.taskBreakdown.forEach(task => {
      const taskSec = (task.duration / 1000).toFixed(2);
      console.log(`${task.name}: ${taskSec}s (${task.percentage.toFixed(1)}%)`, task.metadata || '');
    });
    console.groupEnd();

    console.group('Top 10 Slowest Operations:');
    summary.slowestTasks.forEach((task, index) => {
      const taskSec = (task.duration / 1000).toFixed(2);
      console.log(`${index + 1}. ${task.name}: ${taskSec}s`, task.metadata || '');
    });
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Reset all timers
   */
  reset(): void {
    this.timers.clear();
    this.completedTimers = [];
    this.startTime = performance.now();
  }

  /**
   * Get all timing entries (both active and completed)
   */
  getTimings(): TimingEntry[] {
    const activeTimings = Array.from(this.timers.entries()).map(([name, timer]) => ({
      name,
      startTime: timer.startTime,
      endTime: null,
      metadata: timer.metadata
    }));

    const completedTimings = this.completedTimers.map(timer => ({
      name: timer.name,
      startTime: timer.startTime,
      endTime: timer.startTime + (timer.duration || 0),
      metadata: timer.metadata
    }));

    return [...activeTimings, ...completedTimings];
  }
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}