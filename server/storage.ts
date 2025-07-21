import { 
  users, type User, type InsertUser, type UpdateUserProfile, 
  tokenLogos, type InsertTokenLogo, type TokenLogo, 
  bookmarks, type InsertBookmark, type Bookmark,
  portfolios, type Portfolio, type InsertPortfolio,
  portfolioAddresses, type PortfolioAddress, type InsertPortfolioAddress
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { generateSlug, generateUniqueSlug } from "./utils/slug";
import { generatePublicCode } from "./utils/public-code";

// Storage interface for database access
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
  
  // Portfolio methods
  getPortfolios(userId: number): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  getPortfolioBySlug(slug: string): Promise<Portfolio | undefined>;
  getPortfolioByPublicCode(publicCode: string): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<boolean>;
  
  // Portfolio address methods
  getPortfolioAddresses(portfolioId: number): Promise<PortfolioAddress[]>;
  addAddressToPortfolio(address: InsertPortfolioAddress): Promise<PortfolioAddress>;
  removeAddressFromPortfolio(id: number): Promise<boolean>;
  updatePortfolioAddress(id: number, data: Partial<InsertPortfolioAddress>): Promise<PortfolioAddress>;
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
    try {
      const [logo] = await db
        .select({
          id: tokenLogos.id,
          tokenAddress: tokenLogos.tokenAddress,
          logoUrl: tokenLogos.logoUrl,
          symbol: tokenLogos.symbol,
          name: tokenLogos.name,
          lastUpdated: tokenLogos.lastUpdated
        })
        .from(tokenLogos)
        .where(eq(tokenLogos.tokenAddress, addressLower));
      return logo || undefined;
    } catch (error) {
      console.error(`Error fetching token logo for ${addressLower}:`, error);
      return undefined;
    }
  }

  async saveTokenLogo(logo: InsertTokenLogo): Promise<TokenLogo> {
    // Ensure the token address is lowercase for consistent storage
    const processedLogo = {
      ...logo,
      tokenAddress: logo.tokenAddress.toLowerCase()
    };

    console.log(`Saving logo for token ${processedLogo.tokenAddress}:`, {
      url: processedLogo.logoUrl ? processedLogo.logoUrl.substring(0, 30) + '...' : 'null',
      symbol: processedLogo.symbol,
      name: processedLogo.name
    });

    try {
      // First check if this token already exists
      const existingLogo = await this.getTokenLogo(processedLogo.tokenAddress);
      
      if (existingLogo) {
        console.log(`Token ${processedLogo.tokenAddress} already has a logo, updating it`);
        // Update the existing logo - only use fields that exist in current database
        const updateData: any = {
          logoUrl: processedLogo.logoUrl,
          symbol: processedLogo.symbol,
          name: processedLogo.name,
          lastUpdated: processedLogo.lastUpdated
        };
        
        const [updatedLogo] = await db
          .update(tokenLogos)
          .set(updateData)
          .where(eq(tokenLogos.tokenAddress, processedLogo.tokenAddress))
          .returning();
        
        console.log(`Successfully updated logo for token ${processedLogo.tokenAddress}`);
        return updatedLogo;
      } else {
        console.log(`Token ${processedLogo.tokenAddress} doesn't have a logo yet, inserting new one`);
        // Insert a new logo - only use fields that exist in current database
        const insertData: any = {
          tokenAddress: processedLogo.tokenAddress,
          logoUrl: processedLogo.logoUrl,
          symbol: processedLogo.symbol,
          name: processedLogo.name,
          lastUpdated: processedLogo.lastUpdated
        };
        
        const [newLogo] = await db
          .insert(tokenLogos)
          .values(insertData)
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
  
  async getBookmarkByAddress(userId: number | null, walletAddress: string): Promise<Bookmark | undefined> {
    const addressLower = walletAddress.toLowerCase();
    
    console.log(`Looking for bookmark with userId=${userId}, walletAddress=${addressLower}`);
    
    // Check for null userId
    if (userId === null) {
      console.log('Cannot fetch bookmarks: userId is null');
      return undefined;
    }
    
    // Get all bookmarks for this user
    const userBookmarks = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));
    
    console.log(`Found ${userBookmarks.length} bookmarks for user ${userId}`);
      
    // Find the bookmark with the matching wallet address (case-insensitive)
    const matchingBookmark = userBookmarks.find(bookmark => 
      bookmark.walletAddress.toLowerCase() === addressLower
    );
    
    console.log(`Matching bookmark found: ${matchingBookmark ? 'Yes (ID: ' + matchingBookmark.id + ')' : 'No'}`);
    
    return matchingBookmark;
  }
  
  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    // Ensure wallet address is lowercase for consistent storage
    const processedBookmark = {
      ...bookmark,
      walletAddress: bookmark.walletAddress.toLowerCase()
    };
    
    console.log(`Creating bookmark for address ${processedBookmark.walletAddress}, user ${processedBookmark.userId}`);
    
    try {
      // Check if this bookmark already exists to avoid duplicates
      const existingBookmark = processedBookmark.userId 
        ? await this.getBookmarkByAddress(
            processedBookmark.userId, 
            processedBookmark.walletAddress
          )
        : undefined;
      
      if (existingBookmark) {
        console.log(`Bookmark already exists with id ${existingBookmark.id}, returning existing one`);
        return existingBookmark;
      }
      
      console.log(`Inserting new bookmark into database:`, processedBookmark);
      const [newBookmark] = await db
        .insert(bookmarks)
        .values(processedBookmark)
        .returning();
      
      console.log(`Successfully created new bookmark with id ${newBookmark.id}`);
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

  // Portfolio methods implementation
  async getPortfolios(userId: number): Promise<Portfolio[]> {
    return db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId))
      .orderBy(portfolios.createdAt);
  }
  
  async getPortfolio(id: number): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, id));
      
    return portfolio || undefined;
  }
  
  async getPortfolioBySlug(slug: string): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.slug, slug));
      
    return portfolio || undefined;
  }
  
  async getPortfolioByPublicCode(publicCode: string): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.publicCode, publicCode));
      
    return portfolio || undefined;
  }
  
  async createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
    try {
      // Generate a slug from the portfolio name
      let slug = generateSlug(portfolio.name);
      
      // Check if slug already exists
      const existingPortfolio = await this.getPortfolioBySlug(slug);
      if (existingPortfolio) {
        // Generate unique slug if it already exists
        slug = generateUniqueSlug(slug);
      }
      
      // Generate a unique public code
      let publicCode = generatePublicCode();
      let existingCode = await this.getPortfolioByPublicCode(publicCode);
      
      // Keep generating until we find a unique code
      while (existingCode) {
        publicCode = generatePublicCode();
        existingCode = await this.getPortfolioByPublicCode(publicCode);
      }
      
      const portfolioWithSlugAndCode = {
        ...portfolio,
        slug,
        publicCode
      };
      
      const [newPortfolio] = await db
        .insert(portfolios)
        .values(portfolioWithSlugAndCode)
        .returning();
        
      return newPortfolio;
    } catch (error) {
      console.error(`Error creating portfolio:`, error);
      throw error;
    }
  }
  
  async updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio> {
    try {
      let updateData: any = { ...data, updatedAt: new Date() };
      
      // If name is being updated, regenerate slug
      if (data.name) {
        let slug = generateSlug(data.name);
        
        // Check if slug already exists (excluding current portfolio)
        const existingPortfolio = await this.getPortfolioBySlug(slug);
        if (existingPortfolio && existingPortfolio.id !== id) {
          // Generate unique slug if it already exists
          slug = generateUniqueSlug(slug);
        }
        
        updateData.slug = slug;
      }
      
      const [updatedPortfolio] = await db
        .update(portfolios)
        .set(updateData)
        .where(eq(portfolios.id, id))
        .returning();
        
      return updatedPortfolio;
    } catch (error) {
      console.error(`Error updating portfolio with id ${id}:`, error);
      throw error;
    }
  }
  
  async deletePortfolio(id: number): Promise<boolean> {
    try {
      // First delete all associated addresses
      await db
        .delete(portfolioAddresses)
        .where(eq(portfolioAddresses.portfolioId, id));
        
      // Then delete the portfolio
      const result = await db
        .delete(portfolios)
        .where(eq(portfolios.id, id))
        .returning({ id: portfolios.id });
        
      return result.length > 0;
    } catch (error) {
      console.error(`Error deleting portfolio with id ${id}:`, error);
      throw error;
    }
  }
  
  // Portfolio address methods implementation
  async getPortfolioAddresses(portfolioId: number): Promise<PortfolioAddress[]> {
    return db
      .select()
      .from(portfolioAddresses)
      .where(eq(portfolioAddresses.portfolioId, portfolioId))
      .orderBy(portfolioAddresses.createdAt);
  }
  
  async addAddressToPortfolio(address: InsertPortfolioAddress): Promise<PortfolioAddress> {
    // Ensure wallet address is lowercase for consistent storage
    const processedAddress = {
      ...address,
      walletAddress: address.walletAddress.toLowerCase()
    };
    
    try {
      const [newAddress] = await db
        .insert(portfolioAddresses)
        .values(processedAddress)
        .returning();
        
      return newAddress;
    } catch (error) {
      console.error(`Error adding address to portfolio:`, error);
      throw error;
    }
  }
  
  async removeAddressFromPortfolio(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(portfolioAddresses)
        .where(eq(portfolioAddresses.id, id))
        .returning({ id: portfolioAddresses.id });
        
      return result.length > 0;
    } catch (error) {
      console.error(`Error removing address from portfolio:`, error);
      throw error;
    }
  }
  
  async updatePortfolioAddress(id: number, data: Partial<InsertPortfolioAddress>): Promise<PortfolioAddress> {
    // If wallet address is provided, ensure it's lowercase
    const processedData = data.walletAddress
      ? { ...data, walletAddress: data.walletAddress.toLowerCase() }
      : data;
      
    try {
      const [updatedAddress] = await db
        .update(portfolioAddresses)
        .set(processedData)
        .where(eq(portfolioAddresses.id, id))
        .returning();
        
      return updatedAddress;
    } catch (error) {
      console.error(`Error updating portfolio address:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
