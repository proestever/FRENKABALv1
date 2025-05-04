import { users, type User, type InsertUser, type UpdateUserProfile, tokenLogos, type InsertTokenLogo, type TokenLogo, bookmarks, type InsertBookmark, type Bookmark } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Extend the interface with token logo methods
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(id: number, profileData: Partial<UpdateUserProfile>): Promise<User>;
  
  // Token logo methods
  getTokenLogo(tokenAddress: string): Promise<TokenLogo | undefined>;
  saveTokenLogo(logo: InsertTokenLogo): Promise<TokenLogo>;
  getTokenLogos(): Promise<TokenLogo[]>;
  
  // Bookmark methods
  getBookmarks(userId: number): Promise<Bookmark[]>;
  getBookmarkByAddress(userId: number, walletAddress: string): Promise<Bookmark | undefined>;
  createBookmark(bookmark: InsertBookmark): Promise<Bookmark>;
  updateBookmark(id: number, data: Partial<InsertBookmark>): Promise<Bookmark>;
  deleteBookmark(id: number): Promise<boolean>;
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

  async updateUserProfile(id: number, profileData: Partial<UpdateUserProfile>): Promise<User> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set(profileData)
        .where(eq(users.id, id))
        .returning();
      
      return updatedUser;
    } catch (error) {
      console.error(`Error updating user profile for id ${id}:`, error);
      throw error;
    }
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
  
  // Bookmark methods implementation
  async getBookmarks(userId: number): Promise<Bookmark[]> {
    return db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(bookmarks.createdAt);
  }
  
  async getBookmarkByAddress(userId: number, walletAddress: string): Promise<Bookmark | undefined> {
    const addressLower = walletAddress.toLowerCase();
    
    // Get all bookmarks for this user
    const userBookmarks = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));
      
    // Find the bookmark with the matching wallet address (case-insensitive)
    return userBookmarks.find(bookmark => 
      bookmark.walletAddress.toLowerCase() === addressLower
    );
  }
  
  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    // Ensure wallet address is lowercase for consistent storage
    const processedBookmark = {
      ...bookmark,
      walletAddress: bookmark.walletAddress.toLowerCase()
    };
    
    try {
      const [newBookmark] = await db
        .insert(bookmarks)
        .values(processedBookmark)
        .returning();
        
      return newBookmark;
    } catch (error) {
      console.error(`Error creating bookmark for address ${processedBookmark.walletAddress}:`, error);
      throw error;
    }
  }
  
  async updateBookmark(id: number, data: Partial<InsertBookmark>): Promise<Bookmark> {
    // If wallet address is provided, ensure it's lowercase
    const processedData = data.walletAddress
      ? { ...data, walletAddress: data.walletAddress.toLowerCase() }
      : data;
      
    try {
      const [updatedBookmark] = await db
        .update(bookmarks)
        .set(processedData)
        .where(eq(bookmarks.id, id))
        .returning();
        
      return updatedBookmark;
    } catch (error) {
      console.error(`Error updating bookmark with id ${id}:`, error);
      throw error;
    }
  }
  
  async deleteBookmark(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(bookmarks)
        .where(eq(bookmarks.id, id))
        .returning({ id: bookmarks.id });
        
      return result.length > 0;
    } catch (error) {
      console.error(`Error deleting bookmark with id ${id}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
