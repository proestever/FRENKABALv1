import { eq, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '../db';
import {
  apiUsageStats,
  apiCallRecords,
  type InsertApiUsageStats,
  type InsertApiCallRecord,
} from '@shared/schema';

// Interface for API stats data
export interface ApiCallStats {
  total: number;
  byWallet: Record<string, number>;
  byEndpoint: Record<string, number>;
  lastReset: number;
}

/**
 * Service for handling API usage statistics persistence
 */
export class ApiStatsService {
  /**
   * Record a new API call in the database
   */
  async recordApiCall(
    endpoint: string, 
    walletAddress: string | null = null, 
    responseTime: number | null = null,
    cacheHit: boolean = false,
    successful: boolean = true,
    errorMessage: string | null = null
  ): Promise<void> {
    try {
      const record: InsertApiCallRecord = {
        endpoint,
        walletAddress: walletAddress || null,
        responseTime: responseTime || null,
        cacheHit,
        successful,
        errorMessage: errorMessage || null,
        timestamp: new Date(),
      };

      // Insert the detailed record
      await db.insert(apiCallRecords).values(record);

      // Update the daily aggregate statistics
      const today = new Date();
      const dateStr = format(today, 'yyyy-MM-dd');

      // Try to get existing stats for today
      const [existingStats] = await db
        .select()
        .from(apiUsageStats)
        .where(eq(apiUsageStats.date, dateStr));

      if (existingStats) {
        // Update existing stats
        await db.update(apiUsageStats)
          .set({
            totalCalls: existingStats.totalCalls + 1,
            // Increment the appropriate counter based on endpoint
            walletDataCalls: endpoint.includes('wallet') ? existingStats.walletDataCalls + 1 : existingStats.walletDataCalls,
            transactionCalls: endpoint.includes('transaction') ? existingStats.transactionCalls + 1 : existingStats.transactionCalls,
            tokenPriceCalls: endpoint.includes('price') ? existingStats.tokenPriceCalls + 1 : existingStats.tokenPriceCalls,
            tokenLogoCalls: endpoint.includes('logo') ? existingStats.tokenLogoCalls + 1 : existingStats.tokenLogoCalls,
            // Update cache stats
            cacheHits: cacheHit ? existingStats.cacheHits + 1 : existingStats.cacheHits,
            cacheMisses: !cacheHit ? existingStats.cacheMisses + 1 : existingStats.cacheMisses,
            // Update average response time if we have one
            averageResponseTime: responseTime ? 
              Math.round((existingStats.averageResponseTime || 0) * existingStats.totalCalls + responseTime) / (existingStats.totalCalls + 1) 
              : existingStats.averageResponseTime,
            updatedAt: new Date(),
          })
          .where(eq(apiUsageStats.id, existingStats.id));
      } else {
        // Create new stats for today
        const newStats: InsertApiUsageStats = {
          date: dateStr,
          totalCalls: 1,
          walletDataCalls: endpoint.includes('wallet') ? 1 : 0,
          transactionCalls: endpoint.includes('transaction') ? 1 : 0,
          tokenPriceCalls: endpoint.includes('price') ? 1 : 0,
          tokenLogoCalls: endpoint.includes('logo') ? 1 : 0,
          cacheHits: cacheHit ? 1 : 0,
          cacheMisses: !cacheHit ? 1 : 0,
          averageResponseTime: responseTime || null,
        };
        
        await db.insert(apiUsageStats).values(newStats);
      }

      console.log(`[API Stats] Recorded API call to ${endpoint} from ${walletAddress || 'unknown'}, cache hit: ${cacheHit}`);
    } catch (error) {
      console.error('[API Stats] Error recording API call:', error);
      // Don't throw the error as this is non-critical functionality
    }
  }

  /**
   * Get daily API usage statistics for a date range
   */
  async getDailyStats(
    startDate: string,
    endDate: string = format(new Date(), 'yyyy-MM-dd')
  ) {
    try {
      const stats = await db
        .select()
        .from(apiUsageStats)
        .where(
          sql`${apiUsageStats.date} >= ${startDate} AND ${apiUsageStats.date} <= ${endDate}`
        )
        .orderBy(apiUsageStats.date);
      
      return stats;
    } catch (error) {
      console.error('[API Stats] Error getting daily stats:', error);
      return [];
    }
  }

  /**
   * Get current month's daily statistics
   */
  async getCurrentMonthStats() {
    const today = new Date();
    const firstDayOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');
    const lastDayOfMonth = format(today, 'yyyy-MM-dd');
    
    return this.getDailyStats(firstDayOfMonth, lastDayOfMonth);
  }

  /**
   * Get totals for all time
   */
  async getTotalStats() {
    try {
      const result = await db.select({
        totalCalls: sql`SUM(${apiUsageStats.totalCalls})`,
        walletDataCalls: sql`SUM(${apiUsageStats.walletDataCalls})`,
        transactionCalls: sql`SUM(${apiUsageStats.transactionCalls})`,
        tokenPriceCalls: sql`SUM(${apiUsageStats.tokenPriceCalls})`,
        tokenLogoCalls: sql`SUM(${apiUsageStats.tokenLogoCalls})`,
        cacheHits: sql`SUM(${apiUsageStats.cacheHits})`,
        cacheMisses: sql`SUM(${apiUsageStats.cacheMisses})`,
        avgResponseTime: sql`AVG(${apiUsageStats.averageResponseTime})`,
        firstDate: sql`MIN(${apiUsageStats.date})`,
        lastDate: sql`MAX(${apiUsageStats.date})`,
      }).from(apiUsageStats);
      
      return result[0];
    } catch (error) {
      console.error('[API Stats] Error getting total stats:', error);
      return {
        totalCalls: 0,
        walletDataCalls: 0,
        transactionCalls: 0,
        tokenPriceCalls: 0,
        tokenLogoCalls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgResponseTime: 0,
        firstDate: null,
        lastDate: null,
      };
    }
  }

  /**
   * Get the top N wallet addresses by number of calls
   */
  async getTopWalletAddresses(limit: number = 10) {
    try {
      // Group by wallet address and count occurrences
      const result = await db
        .select({
          walletAddress: apiCallRecords.walletAddress,
          callCount: sql`COUNT(*)`,
        })
        .from(apiCallRecords)
        .where(sql`${apiCallRecords.walletAddress} IS NOT NULL`)
        .groupBy(apiCallRecords.walletAddress)
        .orderBy(apiCallRecords.walletAddress, 'desc')
        .limit(limit);
      
      return result;
    } catch (error) {
      console.error('[API Stats] Error getting top wallet addresses:', error);
      return [];
    }
  }

  /**
   * Get the top N endpoints by number of calls
   */
  async getTopEndpoints(limit: number = 10) {
    try {
      // Group by endpoint and count occurrences
      const result = await db
        .select({
          endpoint: apiCallRecords.endpoint,
          callCount: sql`COUNT(*)`,
        })
        .from(apiCallRecords)
        .groupBy(apiCallRecords.endpoint)
        .orderBy(apiCallRecords.endpoint, 'desc')
        .limit(limit);
      
      return result;
    } catch (error) {
      console.error('[API Stats] Error getting top endpoints:', error);
      return [];
    }
  }

  /**
   * Get the hourly distribution of API calls (for timeseries visualization)
   */
  async getHourlyDistribution(days: number = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const result = await db
        .select({
          hour: sql`EXTRACT(HOUR FROM ${apiCallRecords.timestamp})`,
          callCount: sql`COUNT(*)`,
        })
        .from(apiCallRecords)
        .where(sql`${apiCallRecords.timestamp} >= ${cutoffDate.toISOString()}`)
        .groupBy(sql`EXTRACT(HOUR FROM ${apiCallRecords.timestamp})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${apiCallRecords.timestamp})`);
      
      return result;
    } catch (error) {
      console.error('[API Stats] Error getting hourly distribution:', error);
      return [];
    }
  }
}

// Export singleton instance
export const apiStatsService = new ApiStatsService();