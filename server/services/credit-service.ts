import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { creditUsageSettings } from '@shared/schema';

/**
 * Service for handling credit operations
 */
export class CreditService {
  // Feature keys for different credit operations
  private readonly WALLET_SEARCH_KEY = 'wallet_search';

  /**
   * Deduct credits for a wallet search
   * 
   * @param userId The user ID to deduct credits from
   * @returns True if credits were successfully deducted, false if the user doesn't have enough credits
   */
  async deductCreditsForWalletSearch(userId: number): Promise<boolean> {
    try {
      if (!userId) {
        console.log('[Credit Service] No user ID provided, skipping credit deduction');
        return true; // Allow the operation to proceed without a user
      }

      // Get the credit cost for wallet searches
      const [walletSearchSetting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, this.WALLET_SEARCH_KEY));

      if (!walletSearchSetting || !walletSearchSetting.isActive) {
        console.log('[Credit Service] Wallet search credit feature not active');
        return true; // Allow the operation if the feature is not active
      }

      const creditCost = walletSearchSetting.creditCost;

      // Get user's current credits
      const userCredits = await storage.getUserCredits(userId);
      if (!userCredits) {
        console.error(`[Credit Service] User ${userId} has no credit record`);
        return false;
      }

      // Check if user has enough credits
      if (userCredits.balance < creditCost) {
        console.log(`[Credit Service] User ${userId} doesn't have enough credits. Has: ${userCredits.balance}, Needs: ${creditCost}`);
        return false;
      }

      // Deduct credits
      await storage.deductCreditsFromUser(userId, creditCost);

      // Record the transaction
      await storage.createCreditTransaction({
        userId,
        amount: -creditCost,
        type: 'usage',
        relatedEntityType: 'feature',
        relatedEntityId: this.WALLET_SEARCH_KEY,
        description: 'Wallet search',
      });

      console.log(`[Credit Service] Deducted ${creditCost} credits from user ${userId} for wallet search`);
      return true;
    } catch (error) {
      console.error('[Credit Service] Error deducting credits for wallet search:', error);
      return false;
    }
  }

  /**
   * Check if a user has enough credits for a wallet search
   * 
   * @param userId The user ID to check
   * @returns True if the user has enough credits, false otherwise
   */
  async hasCreditsForWalletSearch(userId: number): Promise<boolean> {
    try {
      if (!userId) {
        console.log('[Credit Service] No user ID provided, allowing operation');
        return true; // Allow the operation without a user
      }

      // Get the credit cost for wallet searches
      const [walletSearchSetting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, this.WALLET_SEARCH_KEY));

      if (!walletSearchSetting || !walletSearchSetting.isActive) {
        console.log('[Credit Service] Wallet search credit feature not active');
        return true; // Allow the operation if the feature is not active
      }

      const creditCost = walletSearchSetting.creditCost;

      // Get user's current credits
      const userCredits = await storage.getUserCredits(userId);
      if (!userCredits) {
        console.error(`[Credit Service] User ${userId} has no credit record`);
        return false;
      }

      // Check if user has enough credits
      return userCredits.balance >= creditCost;
    } catch (error) {
      console.error('[Credit Service] Error checking credits for wallet search:', error);
      return false;
    }
  }
}

// Export singleton instance
export const creditService = new CreditService();