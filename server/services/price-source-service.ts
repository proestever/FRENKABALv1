/**
 * Price Source Service 
 * Handles logic to determine which API to use for token pricing
 */

import { db } from '../db';
import { dexScreenerPreferredTokens, type InsertDexScreenerPreferredToken } from '@shared/schema';
import { cacheService } from './cache-service';
import { eq } from 'drizzle-orm';

// Cache the preferred tokens in memory to avoid database lookups on every token price request
let preferredTokensCache: string[] = [];
let preferredTokensCacheLastUpdate: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all token addresses that should use DexScreener for pricing
 */
export async function getDexScreenerPreferredTokens(): Promise<string[]> {
  const now = Date.now();
  
  // Check if cache is still valid
  if (preferredTokensCache.length > 0 && (now - preferredTokensCacheLastUpdate) < CACHE_TTL) {
    return preferredTokensCache;
  }
  
  try {
    // Fetch all preferred tokens from the database
    const tokens = await db.select().from(dexScreenerPreferredTokens);
    
    // Update cache
    preferredTokensCache = tokens.map(token => token.tokenAddress.toLowerCase());
    preferredTokensCacheLastUpdate = now;
    
    console.log(`Loaded ${preferredTokensCache.length} DexScreener preferred tokens from database`);
    return preferredTokensCache;
  } catch (error) {
    console.error('Error loading DexScreener preferred tokens:', error);
    // Return empty array in case of error, but don't update cache time
    return [];
  }
}

/**
 * Check if a specific token should use DexScreener for pricing
 * Note: All tokens now use DexScreener since we removed Moralis
 */
export async function shouldUseDexScreenerForToken(tokenAddress: string): Promise<boolean> {
  // Always return true since we're using DexScreener for all tokens now
  return true;
}

/**
 * Add a token to the DexScreener preferred list
 */
export async function addDexScreenerPreferredToken(tokenData: InsertDexScreenerPreferredToken): Promise<void> {
  try {
    // Normalize address to lowercase
    const normalizedAddress = tokenData.tokenAddress.toLowerCase();
    tokenData.tokenAddress = normalizedAddress;
    
    // Check if token already exists (using select for exists check)
    const existing = await db.select({id: dexScreenerPreferredTokens.id})
      .from(dexScreenerPreferredTokens)
      .where(eq(dexScreenerPreferredTokens.tokenAddress, normalizedAddress));
    
    if (existing.length > 0) {
      // Update existing record
      const now = new Date();
      await db.update(dexScreenerPreferredTokens)
        .set({
          reason: tokenData.reason,
          symbol: tokenData.symbol,
          name: tokenData.name,
          updatedAt: now
        })
        .where(eq(dexScreenerPreferredTokens.tokenAddress, normalizedAddress));
      
      console.log(`Updated existing DexScreener preferred token: ${normalizedAddress}`);
    } else {
      // Insert new record
      await db.insert(dexScreenerPreferredTokens).values(tokenData);
      console.log(`Added new DexScreener preferred token: ${normalizedAddress}`);
    }
    
    // Invalidate cache
    preferredTokensCache = [];
    preferredTokensCacheLastUpdate = 0;
    
    // Also invalidate price cache for this token
    cacheService.invalidateTokenPrice(normalizedAddress);
  } catch (error) {
    console.error(`Error adding DexScreener preferred token ${tokenData.tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Remove a token from the DexScreener preferred list
 */
export async function removeDexScreenerPreferredToken(tokenAddress: string): Promise<boolean> {
  try {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Delete the record
    const result = await db.delete(dexScreenerPreferredTokens)
      .where(eq(dexScreenerPreferredTokens.tokenAddress, normalizedAddress));
    
    // Invalidate cache
    preferredTokensCache = [];
    preferredTokensCacheLastUpdate = 0;
    
    // Also invalidate price cache for this token
    cacheService.invalidateTokenPrice(normalizedAddress);
    
    console.log(`Removed DexScreener preferred token: ${normalizedAddress}`);
    return true;
  } catch (error) {
    console.error(`Error removing DexScreener preferred token ${tokenAddress}:`, error);
    return false;
  }
}

/**
 * Get all tokens in the preferred list
 */
export async function getAllDexScreenerPreferredTokens() {
  try {
    const tokens = await db.select().from(dexScreenerPreferredTokens);
    return tokens;
  } catch (error) {
    console.error('Error getting all DexScreener preferred tokens:', error);
    return [];
  }
}