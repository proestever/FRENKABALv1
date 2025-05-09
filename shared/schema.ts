import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  website: text("website"),
  twitterHandle: text("twitter_handle"),
  bio: text("bio"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  website: true,
  twitterHandle: true,
  bio: true,
});

export const updateUserProfileSchema = createInsertSchema(users).pick({
  displayName: true,
  website: true,
  twitterHandle: true,
  bio: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type User = typeof users.$inferSelect;

// Define schema for PulseChain token data
export const TokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  balance: z.string(),
  balanceFormatted: z.number().optional(),
  price: z.number().optional(),
  value: z.number().optional(),
  priceChange24h: z.number().optional(),
  logo: z.string().optional(),
  exchange: z.string().optional(),
  verified: z.boolean().optional(),
  securityScore: z.number().optional(),
  isNative: z.boolean().optional(), // Add isNative flag to properly identify native tokens
  isLp: z.boolean().optional(), // Flag for LP (Liquidity Pool) tokens
  lpToken0Symbol: z.string().optional(), // First token symbol in the LP pair
  lpToken1Symbol: z.string().optional(), // Second token symbol in the LP pair
  lpToken0Name: z.string().optional(), // First token name in the LP pair
  lpToken1Name: z.string().optional(), // Second token name in the LP pair
  lpToken0Address: z.string().optional(), // First token address in the LP pair
  lpToken1Address: z.string().optional(), // Second token address in the LP pair
  lpToken0Decimals: z.number().optional(), // First token decimals
  lpToken1Decimals: z.number().optional(), // Second token decimals
  lpToken0Balance: z.string().optional(), // First token balance in raw units
  lpToken1Balance: z.string().optional(), // Second token balance in raw units
  lpToken0BalanceFormatted: z.number().optional(), // First token balance formatted (with decimals)
  lpToken1BalanceFormatted: z.number().optional(), // Second token balance formatted (with decimals)
  lpToken0Price: z.number().optional(), // First token price in USD
  lpToken1Price: z.number().optional(), // Second token price in USD
  lpToken0Value: z.number().optional(), // First token value in USD
  lpToken1Value: z.number().optional(), // Second token value in USD
  lpTotalSupply: z.string().optional(), // Total supply of LP tokens
  lpReserve0: z.string().optional(), // Reserve of token0 in the LP pool
  lpReserve1: z.string().optional(), // Reserve of token1 in the LP pool
});

export type Token = z.infer<typeof TokenSchema>;

// Define schema for pagination
export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

// Define schema for wallet data
export const WalletSchema = z.object({
  address: z.string(),
  tokens: z.array(TokenSchema),
  totalValue: z.number().optional(),
  tokenCount: z.number().optional(),
  plsBalance: z.number().optional(),
  plsPriceChange: z.number().optional(),
  networkCount: z.number().optional(),
  pagination: PaginationSchema.optional(),
});

export type Wallet = z.infer<typeof WalletSchema>;

// Recent addresses schema
export const recentAddresses = pgTable("recent_addresses", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const insertRecentAddressSchema = createInsertSchema(recentAddresses).pick({
  address: true,
  createdAt: true,
});

export type InsertRecentAddress = z.infer<typeof insertRecentAddressSchema>;
export type RecentAddress = typeof recentAddresses.$inferSelect;

// Token logos schema
export const tokenLogos = pgTable("token_logos", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull().unique(),
  logoUrl: text("logo_url").notNull(),
  symbol: text("symbol"),
  name: text("name"),
  lastUpdated: text("last_updated").notNull(),
});

export const insertTokenLogoSchema = createInsertSchema(tokenLogos).pick({
  tokenAddress: true,
  logoUrl: true,
  symbol: true,
  name: true,
  lastUpdated: true,
});

export type InsertTokenLogo = z.infer<typeof insertTokenLogoSchema>;
export type TokenLogo = typeof tokenLogos.$inferSelect;

// Bookmark model for saving wallet addresses with custom labels
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").notNull(),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Bookmark = typeof bookmarks.$inferSelect;

// Portfolio model for organizing collections of wallet addresses
export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

// Portfolio addresses to connect wallets to portfolios
export const portfolioAddresses = pgTable("portfolio_addresses", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  walletAddress: text("wallet_address").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPortfolioAddressSchema = createInsertSchema(portfolioAddresses).omit({
  id: true,
  createdAt: true,
});

export type InsertPortfolioAddress = z.infer<typeof insertPortfolioAddressSchema>;
export type PortfolioAddress = typeof portfolioAddresses.$inferSelect;

// API Usage Statistics - Daily aggregated statistics
export const apiUsageStats = pgTable("api_usage_stats", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(), // Date of the statistics (YYYY-MM-DD)
  totalCalls: integer("total_calls").notNull().default(0),
  walletDataCalls: integer("wallet_data_calls").notNull().default(0),
  transactionCalls: integer("transaction_calls").notNull().default(0),
  tokenPriceCalls: integer("token_price_calls").notNull().default(0),
  tokenLogoCalls: integer("token_logo_calls").notNull().default(0),
  cacheHits: integer("cache_hits").notNull().default(0),
  cacheMisses: integer("cache_misses").notNull().default(0),
  averageResponseTime: integer("average_response_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertApiUsageStatsSchema = createInsertSchema(apiUsageStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApiUsageStats = z.infer<typeof insertApiUsageStatsSchema>;
export type ApiUsageStats = typeof apiUsageStats.$inferSelect;

// Detailed API Call Records - For more granular analysis
export const apiCallRecords = pgTable("api_call_records", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  endpoint: text("endpoint").notNull(),
  walletAddress: text("wallet_address"),
  responseTime: integer("response_time"), // in milliseconds
  cacheHit: boolean("cache_hit").default(false),
  successful: boolean("successful").default(true),
  errorMessage: text("error_message"),
});

export const insertApiCallRecordSchema = createInsertSchema(apiCallRecords).omit({
  id: true,
});

export type InsertApiCallRecord = z.infer<typeof insertApiCallRecordSchema>;
export type ApiCallRecord = typeof apiCallRecords.$inferSelect;

// API Rate Limits - To track and enforce rate limits if needed in the future
export const apiRateLimits = pgTable("api_rate_limits", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  dailyLimit: integer("daily_limit").notNull().default(1000),
  dailyUsage: integer("daily_usage").notNull().default(0),
  lastReset: timestamp("last_reset").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertApiRateLimitSchema = createInsertSchema(apiRateLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApiRateLimit = z.infer<typeof insertApiRateLimitSchema>;
export type ApiRateLimit = typeof apiRateLimits.$inferSelect;

// Special tokens that should use DexScreener API for pricing instead of Moralis
export const dexScreenerPreferredTokens = pgTable("dexscreener_preferred_tokens", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull().unique(),
  reason: text("reason"), // Optional reason for preferring DexScreener
  symbol: text("symbol"), // Optional symbol for display purposes
  name: text("name"), // Optional name for display purposes
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDexScreenerPreferredTokenSchema = createInsertSchema(dexScreenerPreferredTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDexScreenerPreferredToken = z.infer<typeof insertDexScreenerPreferredTokenSchema>;
export type DexScreenerPreferredToken = typeof dexScreenerPreferredTokens.$inferSelect;
