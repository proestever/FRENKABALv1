import { 
  users, type User, type InsertUser, type UpdateUserProfile, type UpdateUserSubscription,
  tokenLogos, type InsertTokenLogo, type TokenLogo, 
  bookmarks, type InsertBookmark, type Bookmark,
  portfolios, type Portfolio, type InsertPortfolio,
  portfolioAddresses, type PortfolioAddress, type InsertPortfolioAddress,
  subscriptionPackages, type SubscriptionPackage, type InsertSubscriptionPackage,
  subscriptionPayments, type SubscriptionPayment, type InsertSubscriptionPayment,
  userCredits, type UserCredits, type InsertUserCredits,
  creditTransactions, type CreditTransaction, type InsertCreditTransaction,
  creditPackages, type CreditPackage, type InsertCreditPackage,
  creditPayments, type CreditPayment, type InsertCreditPayment,
  creditUsageSettings, type CreditUsageSetting, type InsertCreditUsageSetting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

// Storage interface for database access
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(id: number, profileData: Partial<UpdateUserProfile>): Promise<User>;
  
  // Subscription methods
  updateUserSubscription(id: number, subscriptionData: Partial<UpdateUserSubscription>): Promise<User>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  getUserByStripeSubscriptionId(stripeSubscriptionId: string): Promise<User | undefined>;
  
  // Subscription methods
  createSubscriptionPackage(pkg: InsertSubscriptionPackage): Promise<SubscriptionPackage>;
  updateSubscriptionPackage(id: number, data: Partial<InsertSubscriptionPackage>): Promise<SubscriptionPackage>;
  getSubscriptionPackages(activeOnly?: boolean): Promise<SubscriptionPackage[]>;
  getSubscriptionPackageById(id: number): Promise<SubscriptionPackage | undefined>;
  
  // Subscription payments
  createSubscriptionPayment(payment: InsertSubscriptionPayment): Promise<SubscriptionPayment>;
  updateSubscriptionPaymentStatus(id: number, status: string, confirmedAt?: Date): Promise<SubscriptionPayment>;
  getSubscriptionPaymentByTxHash(txHash: string): Promise<SubscriptionPayment | undefined>;
  getUserActiveSubscription(userId: number): Promise<SubscriptionPayment | undefined>;
  getUserSubscriptionHistory(userId: number): Promise<SubscriptionPayment[]>;
  
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
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<boolean>;
  
  // Portfolio address methods
  getPortfolioAddresses(portfolioId: number): Promise<PortfolioAddress[]>;
  addAddressToPortfolio(address: InsertPortfolioAddress): Promise<PortfolioAddress>;
  removeAddressFromPortfolio(id: number): Promise<boolean>;
  updatePortfolioAddress(id: number, data: Partial<InsertPortfolioAddress>): Promise<PortfolioAddress>;
  
  // Credit system methods
  
  // User credits
  getUserCredits(userId: number): Promise<UserCredits | undefined>;
  createUserCredits(userCredits: InsertUserCredits): Promise<UserCredits>;
  updateUserCreditsBalance(userId: number, newBalance: number): Promise<UserCredits>;
  addCreditsToUser(userId: number, amount: number): Promise<UserCredits>;
  deductCreditsFromUser(userId: number, amount: number): Promise<UserCredits>;
  
  // Credit transactions
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactionsByUser(userId: number, limit?: number): Promise<CreditTransaction[]>;
  getCreditTransactionById(id: number): Promise<CreditTransaction | undefined>;
  
  // Credit packages
  createCreditPackage(pkg: InsertCreditPackage): Promise<CreditPackage>;
  updateCreditPackage(id: number, data: Partial<InsertCreditPackage>): Promise<CreditPackage>;
  getCreditPackages(activeOnly?: boolean): Promise<CreditPackage[]>;
  getCreditPackageById(id: number): Promise<CreditPackage | undefined>;
  
  // Credit payments
  createCreditPayment(payment: InsertCreditPayment): Promise<CreditPayment>;
  updateCreditPaymentStatus(id: number, status: string, confirmedAt?: Date): Promise<CreditPayment>;
  getCreditPaymentByTxHash(txHash: string): Promise<CreditPayment | undefined>;
  getCreditPaymentsByUser(userId: number): Promise<CreditPayment[]>;
  
  // Credit usage settings
  createCreditUsageSetting(setting: InsertCreditUsageSetting): Promise<CreditUsageSetting>;
  updateCreditUsageSetting(id: number, data: Partial<InsertCreditUsageSetting>): Promise<CreditUsageSetting>;
  getCreditUsageSettings(): Promise<CreditUsageSetting[]>;
  getCreditUsageSettingByKey(featureKey: string): Promise<CreditUsageSetting | undefined>;
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
  
  // Subscription methods
  async updateUserSubscription(id: number, subscriptionData: Partial<UpdateUserSubscription>): Promise<User> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set(subscriptionData)
        .where(eq(users.id, id))
        .returning();
      
      return updatedUser;
    } catch (error) {
      console.error(`Error updating user subscription for id ${id}:`, error);
      throw error;
    }
  }
  
  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, stripeCustomerId));
      
      return user || undefined;
    } catch (error) {
      console.error(`Error getting user by Stripe customer ID ${stripeCustomerId}:`, error);
      throw error;
    }
  }
  
  async getUserByStripeSubscriptionId(stripeSubscriptionId: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeSubscriptionId, stripeSubscriptionId));
      
      return user || undefined;
    } catch (error) {
      console.error(`Error getting user by Stripe subscription ID ${stripeSubscriptionId}:`, error);
      throw error;
    }
  }
  
  // Subscription package methods
  async createSubscriptionPackage(pkg: InsertSubscriptionPackage): Promise<SubscriptionPackage> {
    try {
      const [subscriptionPackage] = await db
        .insert(subscriptionPackages)
        .values(pkg)
        .returning();
      
      return subscriptionPackage;
    } catch (error) {
      console.error('Error creating subscription package:', error);
      throw error;
    }
  }
  
  async updateSubscriptionPackage(id: number, data: Partial<InsertSubscriptionPackage>): Promise<SubscriptionPackage> {
    try {
      const [updatedPackage] = await db
        .update(subscriptionPackages)
        .set(data)
        .where(eq(subscriptionPackages.id, id))
        .returning();
      
      return updatedPackage;
    } catch (error) {
      console.error(`Error updating subscription package ${id}:`, error);
      throw error;
    }
  }
  
  async getSubscriptionPackages(activeOnly = true): Promise<SubscriptionPackage[]> {
    try {
      if (activeOnly) {
        return db
          .select()
          .from(subscriptionPackages)
          .where(eq(subscriptionPackages.isActive, true))
          .orderBy(subscriptionPackages.displayOrder);
      } else {
        return db
          .select()
          .from(subscriptionPackages)
          .orderBy(subscriptionPackages.displayOrder);
      }
    } catch (error) {
      console.error('Error getting subscription packages:', error);
      throw error;
    }
  }
  
  async getSubscriptionPackageById(id: number): Promise<SubscriptionPackage | undefined> {
    try {
      const [pkg] = await db
        .select()
        .from(subscriptionPackages)
        .where(eq(subscriptionPackages.id, id));
      
      return pkg || undefined;
    } catch (error) {
      console.error(`Error getting subscription package by id ${id}:`, error);
      throw error;
    }
  }
  
  // Subscription payment methods
  async createSubscriptionPayment(payment: InsertSubscriptionPayment): Promise<SubscriptionPayment> {
    try {
      const [subscriptionPayment] = await db
        .insert(subscriptionPayments)
        .values(payment)
        .returning();
      
      return subscriptionPayment;
    } catch (error) {
      console.error('Error creating subscription payment:', error);
      throw error;
    }
  }
  
  async updateSubscriptionPaymentStatus(id: number, status: string, confirmedAt?: Date): Promise<SubscriptionPayment> {
    try {
      const [updatedPayment] = await db
        .update(subscriptionPayments)
        .set({
          status,
          confirmedAt: confirmedAt || undefined,
          updatedAt: new Date()
        })
        .where(eq(subscriptionPayments.id, id))
        .returning();
      
      return updatedPayment;
    } catch (error) {
      console.error(`Error updating subscription payment status ${id}:`, error);
      throw error;
    }
  }
  
  async getSubscriptionPaymentByTxHash(txHash: string): Promise<SubscriptionPayment | undefined> {
    try {
      const [payment] = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.txHash, txHash));
      
      return payment || undefined;
    } catch (error) {
      console.error(`Error getting subscription payment by tx hash ${txHash}:`, error);
      throw error;
    }
  }
  
  async getUserActiveSubscription(userId: number): Promise<SubscriptionPayment | undefined> {
    try {
      const now = new Date();
      const [subscription] = await db
        .select()
        .from(subscriptionPayments)
        .where(
          and(
            eq(subscriptionPayments.userId, userId),
            eq(subscriptionPayments.status, 'confirmed')
          )
        )
        .orderBy(desc(subscriptionPayments.endDate))
        .limit(1);
      
      // Check if subscription is still active
      if (subscription && subscription.endDate && new Date(subscription.endDate) > now) {
        return subscription;
      }
      
      return undefined;
    } catch (error) {
      console.error(`Error getting active subscription for user ${userId}:`, error);
      throw error;
    }
  }
  
  async getUserSubscriptionHistory(userId: number): Promise<SubscriptionPayment[]> {
    try {
      return db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.userId, userId))
        .orderBy(desc(subscriptionPayments.createdAt));
    } catch (error) {
      console.error(`Error getting subscription history for user ${userId}:`, error);
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
  
  async createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
    try {
      const [newPortfolio] = await db
        .insert(portfolios)
        .values(portfolio)
        .returning();
        
      return newPortfolio;
    } catch (error) {
      console.error(`Error creating portfolio:`, error);
      throw error;
    }
  }
  
  async updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio> {
    try {
      const [updatedPortfolio] = await db
        .update(portfolios)
        .set({
          ...data,
          updatedAt: new Date()
        })
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

  // Credit system methods implementation

  // User credits
  async getUserCredits(userId: number): Promise<UserCredits | undefined> {
    try {
      const [userCreditsRecord] = await db
        .select()
        .from(userCredits)
        .where(eq(userCredits.userId, userId));
      
      return userCreditsRecord || undefined;
    } catch (error) {
      console.error(`Error getting user credits for user ${userId}:`, error);
      throw error;
    }
  }

  async createUserCredits(credits: InsertUserCredits): Promise<UserCredits> {
    try {
      // Check if user already has a credits record
      const existingCredits = await this.getUserCredits(credits.userId);
      
      if (existingCredits) {
        return existingCredits; // Return existing record
      }
      
      // Create new credits record if none exists
      const [newCredits] = await db
        .insert(userCredits)
        .values(credits)
        .returning();
      
      return newCredits;
    } catch (error) {
      console.error(`Error creating user credits for user ${credits.userId}:`, error);
      throw error;
    }
  }

  async updateUserCreditsBalance(userId: number, newBalance: number): Promise<UserCredits> {
    try {
      // Ensure user has a credits record
      let userCreditsRecord = await this.getUserCredits(userId);
      
      if (!userCreditsRecord) {
        // Create new credits record with initial balance
        userCreditsRecord = await this.createUserCredits({
          userId,
          balance: newBalance,
          lifetimeCredits: newBalance > 0 ? newBalance : 0,
          lifetimeSpent: 0
        });
        return userCreditsRecord;
      }
      
      // Update existing record
      const [updatedCredits] = await db
        .update(userCredits)
        .set({ 
          balance: newBalance,
          updatedAt: new Date()
        })
        .where(eq(userCredits.userId, userId))
        .returning();
      
      return updatedCredits;
    } catch (error) {
      console.error(`Error updating user credits balance for user ${userId}:`, error);
      throw error;
    }
  }

  async addCreditsToUser(userId: number, amount: number): Promise<UserCredits> {
    if (amount <= 0) {
      throw new Error("Credit amount must be positive");
    }
    
    try {
      // Get existing credits or create if not exists
      const userCreditsRecord = await this.getUserCredits(userId);
      
      if (!userCreditsRecord) {
        // Create new credits record
        return this.createUserCredits({
          userId,
          balance: amount,
          lifetimeCredits: amount,
          lifetimeSpent: 0
        });
      }
      
      // Update existing record
      const newBalance = userCreditsRecord.balance + amount;
      const newLifetimeCredits = userCreditsRecord.lifetimeCredits + amount;
      
      const [updatedCredits] = await db
        .update(userCredits)
        .set({ 
          balance: newBalance,
          lifetimeCredits: newLifetimeCredits,
          updatedAt: new Date()
        })
        .where(eq(userCredits.userId, userId))
        .returning();
      
      return updatedCredits;
    } catch (error) {
      console.error(`Error adding ${amount} credits to user ${userId}:`, error);
      throw error;
    }
  }

  async deductCreditsFromUser(userId: number, amount: number): Promise<UserCredits> {
    if (amount <= 0) {
      throw new Error("Deduction amount must be positive");
    }
    
    try {
      // Get existing credits
      const userCreditsRecord = await this.getUserCredits(userId);
      
      if (!userCreditsRecord) {
        throw new Error(`User ${userId} does not have a credits record`);
      }
      
      // Check if user has enough credits
      if (userCreditsRecord.balance < amount) {
        throw new Error(`Insufficient credits: User has ${userCreditsRecord.balance}, but ${amount} are required`);
      }
      
      // Update balance and lifetime spent
      const newBalance = userCreditsRecord.balance - amount;
      const newLifetimeSpent = userCreditsRecord.lifetimeSpent + amount;
      
      const [updatedCredits] = await db
        .update(userCredits)
        .set({ 
          balance: newBalance,
          lifetimeSpent: newLifetimeSpent,
          updatedAt: new Date()
        })
        .where(eq(userCredits.userId, userId))
        .returning();
      
      return updatedCredits;
    } catch (error) {
      console.error(`Error deducting ${amount} credits from user ${userId}:`, error);
      throw error;
    }
  }

  // Credit transactions
  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    try {
      const [newTransaction] = await db
        .insert(creditTransactions)
        .values(transaction)
        .returning();
      
      return newTransaction;
    } catch (error) {
      console.error(`Error creating credit transaction:`, error);
      throw error;
    }
  }

  async getCreditTransactionsByUser(userId: number, limit?: number): Promise<CreditTransaction[]> {
    try {
      let query = db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(creditTransactions.createdAt, "desc");
      
      if (limit) {
        query = query.limit(limit);
      }
      
      return await query;
    } catch (error) {
      console.error(`Error getting credit transactions for user ${userId}:`, error);
      throw error;
    }
  }

  async getCreditTransactionById(id: number): Promise<CreditTransaction | undefined> {
    try {
      const [transaction] = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.id, id));
      
      return transaction || undefined;
    } catch (error) {
      console.error(`Error getting credit transaction ${id}:`, error);
      throw error;
    }
  }

  // Credit packages
  async createCreditPackage(pkg: InsertCreditPackage): Promise<CreditPackage> {
    try {
      const [newPackage] = await db
        .insert(creditPackages)
        .values(pkg)
        .returning();
      
      return newPackage;
    } catch (error) {
      console.error(`Error creating credit package:`, error);
      throw error;
    }
  }

  async updateCreditPackage(id: number, data: Partial<InsertCreditPackage>): Promise<CreditPackage> {
    try {
      const [updatedPackage] = await db
        .update(creditPackages)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(creditPackages.id, id))
        .returning();
      
      return updatedPackage;
    } catch (error) {
      console.error(`Error updating credit package ${id}:`, error);
      throw error;
    }
  }

  async getCreditPackages(activeOnly = true): Promise<CreditPackage[]> {
    try {
      let query = db
        .select()
        .from(creditPackages)
        .orderBy(creditPackages.displayOrder);
      
      if (activeOnly) {
        query = query.where(eq(creditPackages.isActive, true));
      }
      
      return await query;
    } catch (error) {
      console.error(`Error getting credit packages:`, error);
      throw error;
    }
  }

  async getCreditPackageById(id: number): Promise<CreditPackage | undefined> {
    try {
      const [pkg] = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.id, id));
      
      return pkg || undefined;
    } catch (error) {
      console.error(`Error getting credit package ${id}:`, error);
      throw error;
    }
  }

  // Credit payments
  async createCreditPayment(payment: InsertCreditPayment): Promise<CreditPayment> {
    try {
      // Ensure addresses are lowercase
      const processedPayment = {
        ...payment,
        fromAddress: payment.fromAddress.toLowerCase(),
        toAddress: payment.toAddress.toLowerCase(),
        txHash: payment.txHash.toLowerCase()
      };
      
      const [newPayment] = await db
        .insert(creditPayments)
        .values(processedPayment)
        .returning();
      
      return newPayment;
    } catch (error) {
      console.error(`Error creating credit payment:`, error);
      throw error;
    }
  }

  async updateCreditPaymentStatus(id: number, status: string, confirmedAt?: Date): Promise<CreditPayment> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date()
      };
      
      if (status === 'confirmed' && confirmedAt) {
        updateData.confirmedAt = confirmedAt;
      }
      
      const [updatedPayment] = await db
        .update(creditPayments)
        .set(updateData)
        .where(eq(creditPayments.id, id))
        .returning();
      
      return updatedPayment;
    } catch (error) {
      console.error(`Error updating credit payment status ${id}:`, error);
      throw error;
    }
  }

  async getCreditPaymentByTxHash(txHash: string): Promise<CreditPayment | undefined> {
    try {
      const [payment] = await db
        .select()
        .from(creditPayments)
        .where(eq(creditPayments.txHash, txHash.toLowerCase()));
      
      return payment || undefined;
    } catch (error) {
      console.error(`Error getting credit payment by txHash ${txHash}:`, error);
      throw error;
    }
  }

  async getCreditPaymentsByUser(userId: number): Promise<CreditPayment[]> {
    try {
      return await db
        .select()
        .from(creditPayments)
        .where(eq(creditPayments.userId, userId))
        .orderBy(creditPayments.createdAt, "desc");
    } catch (error) {
      console.error(`Error getting credit payments for user ${userId}:`, error);
      throw error;
    }
  }

  // Credit usage settings
  async createCreditUsageSetting(setting: InsertCreditUsageSetting): Promise<CreditUsageSetting> {
    try {
      const [newSetting] = await db
        .insert(creditUsageSettings)
        .values(setting)
        .returning();
      
      return newSetting;
    } catch (error) {
      console.error(`Error creating credit usage setting:`, error);
      throw error;
    }
  }

  async updateCreditUsageSetting(id: number, data: Partial<InsertCreditUsageSetting>): Promise<CreditUsageSetting> {
    try {
      const [updatedSetting] = await db
        .update(creditUsageSettings)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(creditUsageSettings.id, id))
        .returning();
      
      return updatedSetting;
    } catch (error) {
      console.error(`Error updating credit usage setting ${id}:`, error);
      throw error;
    }
  }

  async getCreditUsageSettings(): Promise<CreditUsageSetting[]> {
    try {
      return await db
        .select()
        .from(creditUsageSettings)
        .orderBy(creditUsageSettings.featureKey);
    } catch (error) {
      console.error(`Error getting credit usage settings:`, error);
      throw error;
    }
  }

  async getCreditUsageSettingByKey(featureKey: string): Promise<CreditUsageSetting | undefined> {
    try {
      const [setting] = await db
        .select()
        .from(creditUsageSettings)
        .where(eq(creditUsageSettings.featureKey, featureKey));
      
      return setting || undefined;
    } catch (error) {
      console.error(`Error getting credit usage setting by key ${featureKey}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
