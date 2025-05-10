import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { userDailyCredits } from '@shared/schema';

/**
 * Service for handling daily free credits
 */
export class DailyCreditsService {
  private readonly DAILY_CREDITS_KEY = 'daily_free_credits';
  private readonly DAILY_CREDITS_AMOUNT = 9000; // 9000 free credits per day

  /**
   * Check if a user is eligible for daily free credits
   * 
   * @param userId The user ID to check
   * @returns True if the user is eligible for free credits
   */
  async isUserEligibleForDailyCredits(userId: number): Promise<boolean> {
    try {
      // Get user's daily credit record
      const [userDailyCredit] = await db
        .select()
        .from(userDailyCredits)
        .where(eq(userDailyCredits.userId, userId));

      // If no record exists, user is eligible for free credits
      if (!userDailyCredit) {
        return true;
      }

      // Check if the last award was more than 24 hours ago
      const lastAwardDate = new Date(userDailyCredit.lastAwardedAt);
      const now = new Date();
      const timeDiff = now.getTime() - lastAwardDate.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      return hoursDiff >= 24;
    } catch (error) {
      console.error('[Daily Credits Service] Error checking daily credits eligibility:', error);
      return false;
    }
  }

  /**
   * Award daily free credits to a user
   * This resets the user's balance to exactly 9000 credits, 
   * rather than adding to the existing balance
   * 
   * @param userId The user ID to award credits to
   * @returns True if credits were awarded, false otherwise
   */
  async awardDailyFreeCredits(userId: number): Promise<boolean> {
    try {
      const userCredits = await storage.getUserCredits(userId);
      
      if (!userCredits) {
        // If no credits record exists, create one with 9000 credits
        await storage.createUserCredits({
          userId,
          balance: this.DAILY_CREDITS_AMOUNT,
          lifetimeCredits: this.DAILY_CREDITS_AMOUNT,
          lifetimeSpent: 0
        });
      } else {
        // Reset the balance to exactly 9000 credits
        await storage.updateUserCreditsBalance(userId, this.DAILY_CREDITS_AMOUNT);
        
        // Record any lost unspent credits from previous day
        const lostCredits = userCredits.balance;
        if (lostCredits > 0) {
          // Record the transaction for expired credits
          await storage.createCreditTransaction({
            userId,
            amount: -lostCredits,
            type: 'expiration',
            relatedEntityType: 'system',
            relatedEntityId: 'expired_credits',
            description: 'Daily credits expired',
          });
        }
      }

      // Update or create daily credits record
      const [existingRecord] = await db
        .select()
        .from(userDailyCredits)
        .where(eq(userDailyCredits.userId, userId));

      if (existingRecord) {
        // Update existing record
        await db
          .update(userDailyCredits)
          .set({
            lastAwardedAt: new Date(),
            timesAwarded: existingRecord.timesAwarded + 1,
            totalAwarded: existingRecord.totalAwarded + this.DAILY_CREDITS_AMOUNT
          })
          .where(eq(userDailyCredits.id, existingRecord.id));
      } else {
        // Create new record
        await db
          .insert(userDailyCredits)
          .values({
            userId,
            lastAwardedAt: new Date(),
            timesAwarded: 1,
            totalAwarded: this.DAILY_CREDITS_AMOUNT
          });
      }

      // Record the transaction for new daily credits
      await storage.createCreditTransaction({
        userId,
        amount: this.DAILY_CREDITS_AMOUNT,
        type: 'award',
        relatedEntityType: 'system',
        relatedEntityId: this.DAILY_CREDITS_KEY,
        description: 'Daily free credits',
      });

      return true;
    } catch (error) {
      console.error('[Daily Credits Service] Error awarding daily credits:', error);
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
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        console.log(`[Daily Credits Service] User ${userId} doesn't exist`);
        return 0;
      }

      // Check if user is eligible for daily credits
      const isEligible = await this.isUserEligibleForDailyCredits(userId);
      if (!isEligible) {
        console.log(`[Daily Credits Service] User ${userId} is not eligible for daily credits yet`);
        return 0;
      }

      // Award daily credits
      const awarded = await this.awardDailyFreeCredits(userId);
      if (awarded) {
        console.log(`[Daily Credits Service] Awarded ${this.DAILY_CREDITS_AMOUNT} daily credits to user ${userId}`);
        return this.DAILY_CREDITS_AMOUNT;
      } else {
        console.error(`[Daily Credits Service] Failed to award daily credits to user ${userId}`);
        return 0;
      }
    } catch (error) {
      console.error('[Daily Credits Service] Error checking and awarding daily credits:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const dailyCreditsService = new DailyCreditsService();