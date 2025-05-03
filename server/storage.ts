import { users, type User, type InsertUser, tokenLogos, type InsertTokenLogo, type TokenLogo } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Extend the interface with token logo methods
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Token logo methods
  getTokenLogo(tokenAddress: string): Promise<TokenLogo | undefined>;
  saveTokenLogo(logo: InsertTokenLogo): Promise<TokenLogo>;
  getTokenLogos(): Promise<TokenLogo[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getTokenLogo(tokenAddress: string): Promise<TokenLogo | undefined> {
    const addressLower = tokenAddress.toLowerCase();
    const [logo] = await db
      .select()
      .from(tokenLogos)
      .where(eq(tokenLogos.tokenAddress, addressLower));
    return logo || undefined;
  }

  async saveTokenLogo(logo: InsertTokenLogo): Promise<TokenLogo> {
    // Ensure the token address is lowercase for consistent storage
    const processedLogo = {
      ...logo,
      tokenAddress: logo.tokenAddress.toLowerCase()
    };

    console.log(`Saving logo for token ${processedLogo.tokenAddress}:`, {
      url: processedLogo.logoUrl.substring(0, 30) + '...',
      symbol: processedLogo.symbol,
      name: processedLogo.name
    });

    try {
      // First check if this token already exists
      const existingLogo = await this.getTokenLogo(processedLogo.tokenAddress);
      
      if (existingLogo) {
        console.log(`Token ${processedLogo.tokenAddress} already has a logo, updating it`);
        // Update the existing logo
        const [updatedLogo] = await db
          .update(tokenLogos)
          .set({
            logoUrl: processedLogo.logoUrl,
            symbol: processedLogo.symbol,
            name: processedLogo.name,
            lastUpdated: processedLogo.lastUpdated
          })
          .where(eq(tokenLogos.tokenAddress, processedLogo.tokenAddress))
          .returning();
        
        console.log(`Successfully updated logo for token ${processedLogo.tokenAddress}`);
        return updatedLogo;
      } else {
        console.log(`Token ${processedLogo.tokenAddress} doesn't have a logo yet, inserting new one`);
        // Insert a new logo
        const [newLogo] = await db
          .insert(tokenLogos)
          .values(processedLogo)
          .returning();
        
        console.log(`Successfully inserted new logo for token ${processedLogo.tokenAddress}`);
        return newLogo;
      }
    } catch (error) {
      console.error(`Error saving token logo for ${processedLogo.tokenAddress}:`, error);
      throw error;
    }
  }

  async getTokenLogos(): Promise<TokenLogo[]> {
    return db.select().from(tokenLogos);
  }
}

export const storage = new DatabaseStorage();
