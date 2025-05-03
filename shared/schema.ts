import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
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
});

export type Token = z.infer<typeof TokenSchema>;

// Define schema for wallet data
export const WalletSchema = z.object({
  address: z.string(),
  tokens: z.array(TokenSchema),
  totalValue: z.number().optional(),
  tokenCount: z.number().optional(),
  plsBalance: z.number().optional(),
  plsPriceChange: z.number().optional(),
  networkCount: z.number().optional(),
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
