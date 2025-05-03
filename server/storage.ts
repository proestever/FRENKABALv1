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

    try {
      // Try to insert, but if the token already exists, update it
      const [savedLogo] = await db
        .insert(tokenLogos)
        .values(processedLogo)
        .onConflictDoUpdate({
          target: tokenLogos.tokenAddress,
          set: {
            logoUrl: processedLogo.logoUrl,
            symbol: processedLogo.symbol,
            name: processedLogo.name,
            lastUpdated: processedLogo.lastUpdated
          }
        })
        .returning();
      return savedLogo;
    } catch (error) {
      console.error('Error saving token logo:', error);
      throw error;
    }
  }

  async getTokenLogos(): Promise<TokenLogo[]> {
    return db.select().from(tokenLogos);
  }
}

export const storage = new DatabaseStorage();
