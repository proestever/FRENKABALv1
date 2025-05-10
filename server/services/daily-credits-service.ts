import { eq, sql, gt, and } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { 
  creditUsageSettings,
  creditTransactions,
  users,
} from '@shared/schema';

/**
 * Service for handling daily free credits
 */
export class DailyCreditsService {
  private readonly DAILY_CREDITS_KEY = 'daily_free_credits';

  /**
   * Check if a user is eligible for daily free credits
   * 
   * @param userId The user ID to check
   * @returns True if the user is eligible for free credits
   */
  async isUserEligibleForDailyCredits(userId: number): Promise<boolean> {
    try {
      // Find the daily free credits setting
      const [dailyCreditsSetting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, this.DAILY_CREDITS_KEY));

      // If feature is not active, user is not eligible
      if (!dailyCreditsSetting || !dailyCreditsSetting.isActive) {
        console.log(`[Daily Credits] Feature is not active`);
        return false;
      }

      // Calculate the timestamp for 24 hours ago
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      // Check if user received free credits within the last 24 hours
      const [recentTransaction] = await db
        .select()
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, userId),
            eq(creditTransactions.type, 'daily_free'),
            gt(creditTransactions.createdAt, oneDayAgo)
          )
        )
        .orderBy(sql`${creditTransactions.createdAt} DESC`)
        .limit(1);

      // User is eligible if they haven't received free credits in the last 24 hours
      return !recentTransaction;
    } catch (error) {
      console.error('[Daily Credits] Error checking eligibility:', error);
      return false;
    }
  }

  /**
   * Award daily free credits to a user
   * 
   * @param userId The user ID to award credits to
   * @returns True if credits were awarded, false otherwise
   */
  async awardDailyFreeCredits(userId: number): Promise<boolean> {
    try {
      // Check if user is eligible
      const isEligible = await this.isUserEligibleForDailyCredits(userId);
      if (!isEligible) {
        console.log(`[Daily Credits] User ${userId} is not eligible for daily free credits`);
        return false;
      }

      // Get the daily free credits amount
      const [dailyCreditsSetting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, this.DAILY_CREDITS_KEY));

      if (!dailyCreditsSetting) {
        console.error('[Daily Credits] Daily free credits setting not found');
        return false;
      }

      // Get the free credits amount
      const freeCreditsAmount = dailyCreditsSetting.creditCost;

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`[Daily Credits] User ${userId} not found`);
        return false;
      }

      // Add credits to user's balance
      await storage.addCreditsToUser(userId, freeCreditsAmount);

      // Create a transaction record
      await storage.createCreditTransaction({
        userId,
        amount: freeCreditsAmount,
        type: 'daily_free',
        relatedEntityType: null,
        relatedEntityId: null,
        description: 'Daily free credits',
      });

      console.log(`[Daily Credits] Awarded ${freeCreditsAmount} free credits to user ${userId}`);
      return true;
    } catch (error) {
      console.error('[Daily Credits] Error awarding daily free credits:', error);
      return false;
    }
  }

  /**
   * Check and award daily free credits to a user if they're eligible
   * 
   * This should be called whenever a user logs in or makes an API request
   * 
   * @param userId The user ID to check and award credits to
   * @returns The number of credits awarded, or 0 if no credits were awarded
   */
  async checkAndAwardDailyCredits(userId: number): Promise<number> {
    try {
      // Get the daily free credits setting
      const [dailyCreditsSetting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, this.DAILY_CREDITS_KEY));

      if (!dailyCreditsSetting || !dailyCreditsSetting.isActive) {
        return 0;
      }

      const isEligible = await this.isUserEligibleForDailyCredits(userId);
      if (isEligible) {
        const freeCreditsAmount = dailyCreditsSetting.creditCost;
        const awarded = await this.awardDailyFreeCredits(userId);
        return awarded ? freeCreditsAmount : 0;
      }

      return 0;
    } catch (error) {
      console.error('[Daily Credits] Error checking and awarding daily credits:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const dailyCreditsService = new DailyCreditsService();