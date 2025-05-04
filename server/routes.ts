import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getWalletData, getTokenPrice, getWalletTransactionHistory } from "./services/api";
import { getDonations, getTopDonors, clearDonationCache } from "./services/donations";
import { z } from "zod";
import { TokenLogo, insertBookmarkSchema, insertUserSchema } from "@shared/schema";
import { ethers } from "ethers";

// Loading progress tracking
export interface LoadingProgress {
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'loading' | 'complete' | 'error';
  message: string;
}

// Initialize loading progress
export const loadingProgress: LoadingProgress = {
  currentBatch: 0,
  totalBatches: 0,
  status: 'idle',
  message: ''
};

// Update loading progress (exposed for use in api.ts)
export const updateLoadingProgress = (progress: Partial<LoadingProgress>) => {
  Object.assign(loadingProgress, progress);
};

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoint to get loading progress
  app.get("/api/loading-progress", (_req, res) => {
    res.json(loadingProgress);
  });
  
  // API route to get wallet data
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const walletData = await getWalletData(address);
      
      // Store this address in recent addresses (for future implementation)
      // For now we're just returning the data
      
      return res.json(walletData);
    } catch (error) {
      console.error("Error fetching wallet data:", error);
      return res.status(500).json({ 
        message: "Failed to fetch wallet data",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // API route to get token prices
  app.get("/api/token/price/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Validate token address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }
      
      const priceData = await getTokenPrice(address);
      if (!priceData) {
        return res.status(404).json({ message: "Token price not found" });
      }
      
      return res.json(priceData);
    } catch (error) {
      console.error("Error fetching token price:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token price",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API route to get wallet transaction history
  app.get("/api/wallet/:address/transactions", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = '100', cursor = null } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      // Parse limit to integer with a maximum value to prevent abuse
      // Allow up to 200 transactions per request (as requested)
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 200, 200);
      
      // Call the API service with pagination parameters
      const transactionHistory = await getWalletTransactionHistory(
        address, 
        parsedLimit, 
        cursor as string | null
      );
      
      // Return structured response even if there are no transactions
      if (!transactionHistory || transactionHistory.error) {
        return res.status(500).json({ 
          message: "Failed to fetch transaction history",
          error: transactionHistory?.error || "Unknown error"
        });
      }
      
      return res.json(transactionHistory);
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      return res.status(500).json({ 
        message: "Failed to fetch transaction history",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Token Logo API Routes
  app.get("/api/token-logos", async (_req, res) => {
    try {
      const logos = await storage.getTokenLogos();
      return res.json(logos);
    } catch (error) {
      console.error("Error fetching token logos:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token logos",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Batch API for fetching multiple logos at once
  app.post("/api/token-logos/batch", async (req, res) => {
    try {
      const { addresses } = req.body;
      
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ message: "addresses must be an array" });
      }
      
      // Limit batch size but don't fail - just process a subset
      const MAX_BATCH_SIZE = 100;
      let addressesToProcess = addresses;
      
      if (addresses.length > MAX_BATCH_SIZE) {
        console.log(`Batch size ${addresses.length} exceeds maximum (${MAX_BATCH_SIZE}). Processing first ${MAX_BATCH_SIZE} addresses.`);
        addressesToProcess = addresses.slice(0, MAX_BATCH_SIZE);
      }
      
      // Normalize addresses
      const normalizedAddresses = addressesToProcess.map(addr => 
        typeof addr === 'string' ? addr.toLowerCase() : addr);
      
      // Get all existing logos from storage
      const existingLogos = await Promise.all(
        normalizedAddresses.map(async (address) => {
          try {
            return await storage.getTokenLogo(address);
          } catch (err) {
            console.error(`Error fetching logo for ${address}:`, err);
            return null;
          }
        })
      );
      
      // Create a map of address -> logo
      const logoMap: Record<string, any> = {};
      
      // For addresses without logos in our DB, try to fetch from Moralis
      const missingAddresses = normalizedAddresses.filter(
        (addr, index) => !existingLogos[index]
      );
      
      // First, add all existing logos to the map
      for (let i = 0; i < normalizedAddresses.length; i++) {
        if (existingLogos[i]) {
          logoMap[normalizedAddresses[i]] = existingLogos[i];
        }
      }
      
      // Special case for native PLS token
      if (missingAddresses.includes('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')) {
        const plsIndex = missingAddresses.indexOf('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        if (plsIndex !== -1) {
          const plsLogo = {
            tokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            logoUrl: '/assets/pls-logo-trimmed.png',
            symbol: "PLS",
            name: "PulseChain",
            lastUpdated: new Date().toISOString()
          };
          
          // Store it for future requests
          await storage.saveTokenLogo(plsLogo);
          
          // Add to response map
          logoMap['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = plsLogo;
          
          // Remove from missing addresses
          missingAddresses.splice(plsIndex, 1);
        }
      }
      
      // For any remaining missing logos, try to fetch from Moralis in parallel
      // but limit concurrent requests to 5 to avoid rate limiting
      const CONCURRENT_LIMIT = 5;
      const chunks = [];
      for (let i = 0; i < missingAddresses.length; i += CONCURRENT_LIMIT) {
        chunks.push(missingAddresses.slice(i, i + CONCURRENT_LIMIT));
      }
      
      for (const chunk of chunks) {
        await Promise.all(chunk.map(async (address) => {
          try {
            // Try to get token data from Moralis
            const tokenData = await getTokenPrice(address);
            
            if (tokenData && tokenData.tokenLogo) {
              const newLogo = {
                tokenAddress: address,
                logoUrl: tokenData.tokenLogo,
                symbol: tokenData.tokenSymbol || "",
                name: tokenData.tokenName || "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store in database
              const savedLogo = await storage.saveTokenLogo(newLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
            } else {
              // If Moralis doesn't have a logo, use Frenkabal as default
              const defaultLogo = {
                tokenAddress: address,
                logoUrl: '/assets/100xfrenlogo.png',
                symbol: tokenData?.tokenSymbol || "",
                name: tokenData?.tokenName || "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store default logo in database to prevent future API calls
              const savedLogo = await storage.saveTokenLogo(defaultLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
              console.log(`Saved default Frenkabal logo for token ${address} in batch request`);
            }
          } catch (error) {
            console.error(`Error fetching logo for ${address} in batch:`, error);
            
            // Even on error, save a default logo to prevent future API calls
            try {
              const defaultLogo = {
                tokenAddress: address,
                logoUrl: '/assets/100xfrenlogo.png',
                symbol: "",
                name: "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store default logo in database
              const savedLogo = await storage.saveTokenLogo(defaultLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
              console.log(`Saved error fallback logo for token ${address} in batch request`);
            } catch (saveErr) {
              console.error(`Failed to save fallback logo for ${address}:`, saveErr);
            }
          }
        }));
      }
      
      return res.json(logoMap);
    } catch (error) {
      console.error("Error in batch logo fetch:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token logos in batch",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/token-logo/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Special case for native PLS token (0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)
      if (address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        console.log("Detected request for native PLS token logo, using special handling");
        
        // Check if we already have this logo saved
        let logo = await storage.getTokenLogo(address);
        
        if (!logo) {
          // Store our custom PLS logo for the native token
          const newLogo = {
            tokenAddress: address,
            logoUrl: '/assets/pls-logo-trimmed.png', // Reference to static asset we're serving
            symbol: "PLS",
            name: "PulseChain",
            lastUpdated: new Date().toISOString()
          };
          
          console.log(`Saving logo for token ${address}: ${newLogo.logoUrl}`);
          logo = await storage.saveTokenLogo(newLogo);
          console.log(`Saved new token logo for ${address}: ${newLogo.logoUrl}`);
        }
        
        return res.json(logo);
      }
      
      // For other tokens, validate the address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }

      // Check if logo exists in our database
      let logo = await storage.getTokenLogo(address);
      
      // If not found in database, fetch from Moralis API and store
      if (!logo) {
        try {
          const tokenData = await getTokenPrice(address);
          
          if (tokenData && tokenData.tokenLogo) {
            const newLogo = {
              tokenAddress: address,
              logoUrl: tokenData.tokenLogo,
              symbol: tokenData.tokenSymbol || "",
              name: tokenData.tokenName || "",
              lastUpdated: new Date().toISOString()
            };
            
            logo = await storage.saveTokenLogo(newLogo);
            console.log(`Saved new token logo for ${address}: ${tokenData.tokenLogo}`);
          } else {
            // If Moralis doesn't have a logo, save a default logo
            // This prevents having to check Moralis again in the future for this token
            
            // Store Frenkabal logo as default for unknown tokens
            const defaultLogo = {
              tokenAddress: address,
              logoUrl: '/assets/100xfrenlogo.png', // Path to static asset
              symbol: tokenData?.tokenSymbol || "",
              name: tokenData?.tokenName || "",
              lastUpdated: new Date().toISOString()
            };
            
            logo = await storage.saveTokenLogo(defaultLogo);
            console.log(`Saved default logo for token ${address} with no Moralis logo`);
          }
        } catch (err) {
          console.error(`Error fetching token data from Moralis: ${err}`);
          
          // Even on error, we should store a default logo to prevent future API calls
          const defaultLogo = {
            tokenAddress: address,
            logoUrl: '/assets/100xfrenlogo.png', // Path to static asset
            symbol: "",
            name: "",
            lastUpdated: new Date().toISOString()
          };
          
          logo = await storage.saveTokenLogo(defaultLogo);
          console.log(`Saved fallback logo for token ${address} after Moralis error`);
        }
      }
      
      // By this point, we should always have a logo - either a real one or a fallback
      // But as a final safety check, create a default logo if somehow we still don't have one
      if (!logo) {
        // Create default fallback logo as absolute last resort
        const fallbackLogo = {
          tokenAddress: address,
          logoUrl: '/assets/100xfrenlogo.png',
          symbol: null,
          name: null,
          lastUpdated: new Date().toISOString()
        };
        
        try {
          logo = await storage.saveTokenLogo(fallbackLogo);
          console.log(`Created final fallback logo for ${address}`);
        } catch (err) {
          console.error(`Failed to save final fallback logo: ${err}`);
          
          // If we still somehow don't have a logo at this point,
          // create a final error response instead of returning 404
          return res.json({
            id: -1,
            tokenAddress: address,
            logoUrl: '/assets/100xfrenlogo.png',
            symbol: null,
            name: null,
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      // At this point we should definitely have a logo to return
      return res.json(logo);
    } catch (error) {
      console.error("Error fetching token logo:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token logo",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Endpoint to manually add/update a token logo
  app.post("/api/token-logo", async (req, res) => {
    try {
      // Validate request body
      const schema = z.object({
        tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        logoUrl: z.string().url(),
        symbol: z.string().optional(),
        name: z.string().optional()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      const logo = await storage.saveTokenLogo({
        tokenAddress: data.tokenAddress,
        logoUrl: data.logoUrl,
        symbol: data.symbol || "",
        name: data.name || "",
        lastUpdated: new Date().toISOString()
      });
      
      return res.json(logo);
    } catch (error) {
      console.error("Error saving token logo:", error);
      return res.status(500).json({ 
        message: "Failed to save token logo",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

// User API Routes
  app.post("/api/users/wallet", async (req, res) => {
    try {
      const { walletAddress, signature, message, timestamp } = req.body;
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ message: "Valid wallet address is required" });
      }
      
      // Create a deterministic username from the wallet address
      const username = `wallet_${walletAddress.toLowerCase()}`;
      
      // Check if user already exists
      let user = await storage.getUserByUsername(username);
      
      // Verify signature if provided
      let signatureVerified = false;
      
      if (signature && message && timestamp) {
        try {
          // Recover the address from the signature
          const recoveredAddress = ethers.utils.verifyMessage(message, signature);
          
          // Check if the recovered address matches the claimed address
          if (recoveredAddress.toLowerCase() === walletAddress.toLowerCase()) {
            console.log(`Signature verified for wallet ${walletAddress}`);
            signatureVerified = true;
            
            // Check timestamp freshness (10 minutes)
            const currentTime = Date.now();
            const messageTime = parseInt(timestamp.toString());
            const maxAgeMs = 10 * 60 * 1000; // 10 minutes
            
            if (isNaN(messageTime) || (currentTime - messageTime) > maxAgeMs) {
              console.log(`Signature timestamp too old or invalid: ${messageTime}`);
              signatureVerified = false;
              return res.status(401).json({
                message: "Signature has expired. Please reconnect your wallet."
              });
            }
          } else {
            console.log(`Signature verification failed for wallet ${walletAddress}. Recovered: ${recoveredAddress}`);
            return res.status(401).json({
              message: "Signature verification failed. The signature doesn't match the wallet address."
            });
          }
        } catch (signError) {
          console.error("Error verifying signature:", signError);
          return res.status(401).json({
            message: "Invalid signature format."
          });
        }
      } 
      // For read-only operations or user lookup without sensitive actions,
      // we can still return user info without signature if the user exists
      else if (user) {
        console.log(`Returning existing user ${user.id} for wallet ${walletAddress} without signature verification`);
        return res.json({ 
          id: user.id,
          username: user.username
        });
      } 
      // But for creating a new user, we require signature verification
      else if (!signatureVerified) {
        console.log(`Attempt to create new user for wallet ${walletAddress} without signature verification`);
        return res.status(401).json({
          message: "Signature verification required to create a new account."
        });
      }
      
      // If verification passed and user exists, return the user
      if (signatureVerified && user) {
        return res.json({ 
          id: user.id,
          username: user.username
        });
      }
      
      // User doesn't exist and signature is verified, create a new one
      // Generate a deterministic password (not secure, but suitable for this demo)
      const password = `pwd_${walletAddress.toLowerCase()}`;
      
      try {
        user = await storage.createUser({
          username,
          password
        });
        
        console.log(`Created new user ${user.id} for verified wallet ${walletAddress}`);
        return res.json({ 
          id: user.id,
          username: user.username
        });
      } catch (createError) {
        // In case there's a race condition and the user was created between our check and create
        console.log("Error creating user, checking if it exists now:", createError);
        user = await storage.getUserByUsername(username);
        
        if (user) {
          return res.json({ 
            id: user.id,
            username: user.username
          });
        } else {
          throw createError; // Re-throw if the user still doesn't exist
        }
      }
    } catch (error) {
      console.error("Error getting/creating user from wallet:", error);
      return res.status(500).json({ 
        message: "Failed to get/create user",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Get user profile data
  app.get("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate user ID
      const userId = parseInt(id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Get user from storage
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user data (excluding password)
      const { password, ...userData } = user;
      return res.json(userData);
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ 
        message: "Failed to fetch user data",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Update user profile data
  app.patch("/api/users/:id/profile", async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, website, twitterHandle, bio } = req.body;
      
      // Validate user ID
      const userId = parseInt(id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Verify user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update profile with provided data
      const updatedUser = await storage.updateUserProfile(userId, {
        displayName,
        website,
        twitterHandle,
        bio
      });
      
      return res.status(200).json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      return res.status(500).json({ 
        message: "Failed to update user profile",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Bookmark API Routes
  
  // Get all bookmarks for a user with userId in URL
  app.get("/api/bookmarks/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const bookmarks = await storage.getBookmarks(userId);
      return res.json(bookmarks);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      return res.status(500).json({ 
        message: "Failed to fetch bookmarks",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Simple endpoint for getting the authenticated user's bookmarks
  app.get("/api/bookmarks", async (req, res) => {
    try {
      // For simplicity, we're using the walletAddress query parameter if provided
      const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required. Please provide it as a query parameter." });
      }
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const bookmarks = await storage.getBookmarks(userId);
      return res.json(bookmarks);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      return res.status(500).json({ 
        message: "Failed to fetch bookmarks",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Get a specific bookmark by wallet address
  app.get("/api/bookmarks/:userId/address/:walletAddress", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { walletAddress } = req.params;
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      const bookmark = await storage.getBookmarkByAddress(userId, walletAddress);
      
      if (!bookmark) {
        return res.status(404).json({ message: "Bookmark not found" });
      }
      
      return res.json(bookmark);
    } catch (error) {
      console.error("Error fetching bookmark:", error);
      return res.status(500).json({ 
        message: "Failed to fetch bookmark",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Create a new bookmark
  app.post("/api/bookmarks", async (req, res) => {
    try {
      // Create an extended schema that includes isFavorite field
      const extendedBookmarkSchema = insertBookmarkSchema.extend({
        isFavorite: z.boolean().optional().default(false),
      });
      
      // Validate request body using extended schema
      const validationResult = extendedBookmarkSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid bookmark data", 
          details: validationResult.error.errors 
        });
      }
      
      const bookmarkData = validationResult.data;
      
      // Check if this wallet is already bookmarked by this user
      const existingBookmark = await storage.getBookmarkByAddress(
        Number(bookmarkData.userId), 
        bookmarkData.walletAddress
      );
      
      if (existingBookmark) {
        return res.status(409).json({ 
          message: "This wallet address is already bookmarked by this user",
          bookmark: existingBookmark
        });
      }
      
      // Create the new bookmark
      const newBookmark = await storage.createBookmark(bookmarkData);
      return res.status(201).json(newBookmark);
    } catch (error) {
      console.error("Error creating bookmark:", error);
      return res.status(500).json({ 
        message: "Failed to create bookmark",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Update an existing bookmark
  app.patch("/api/bookmarks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid bookmark ID" });
      }
      
      // Define update schema (subset of insert schema)
      const updateSchema = z.object({
        label: z.string().optional(),
        notes: z.string().optional(),
        isFavorite: z.boolean().optional(),
      });
      
      // Validate request body
      const validationResult = updateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid update data", 
          details: validationResult.error.errors 
        });
      }
      
      const updateData = validationResult.data;
      
      // Update the bookmark
      const updatedBookmark = await storage.updateBookmark(id, updateData);
      return res.json(updatedBookmark);
    } catch (error) {
      console.error("Error updating bookmark:", error);
      return res.status(500).json({ 
        message: "Failed to update bookmark",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Delete a bookmark
  app.delete("/api/bookmarks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid bookmark ID" });
      }
      
      const success = await storage.deleteBookmark(id);
      
      if (!success) {
        return res.status(404).json({ message: "Bookmark not found" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      return res.status(500).json({ 
        message: "Failed to delete bookmark",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // API route to get donations for a specific address
  app.get("/api/donations/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = '100', refresh = 'false' } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid donation address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid donation address format" });
      }
      
      // Parse limit to integer with a maximum value to prevent abuse
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 100, 200);
      
      let forceRefresh = refresh === 'true';
      
      // Clear cache if refresh is requested
      if (forceRefresh) {
        clearDonationCache();
        console.log("Cleared donation cache due to refresh request");
      }
      
      // Fetch donations for the specified address, force refresh if requested
      const donationRecords = await getDonations(address, forceRefresh);
      
      // Debug and ensure all tokens are included in totals
      console.log(`Found ${donationRecords.length} donors for address ${address}`);
      
      // Calculate total donated across all donors for all token types
      let allTokensSum = 0;
      for (const record of donationRecords) {
        let donorTotal = 0;
        // Log token types and recalculate total for each donor
        for (const donation of record.donations) {
          donorTotal += donation.valueUsd;
          console.log(`Donor ${record.donorAddress} donated ${donation.amount} ${donation.tokenSymbol} worth $${donation.valueUsd.toFixed(4)}`);
        }
        
        // Ensure the total is accurate by setting it to our recalculated value
        record.totalValueUsd = donorTotal;
        allTokensSum += donorTotal;
        
        console.log(`Donor ${record.donorAddress} total: $${donorTotal.toFixed(4)} from ${record.donations.length} donations`);
      }
      console.log(`Total across all donors: $${allTokensSum.toFixed(4)}`);
      
      // Get top donors ranked by total donation value
      const topDonors = getTopDonors(donationRecords, parsedLimit);
      
      // Return the top donors
      return res.json(topDonors);
    } catch (error) {
      console.error("Error fetching donations:", error);
      return res.status(500).json({ 
        message: "Failed to fetch donations",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API route to clear donation cache (for admin/debug purposes)
  app.post("/api/donations/clear-cache", (req, res) => {
    try {
      // Clear the donation cache to force refresh on next request
      clearDonationCache();
      return res.json({ success: true, message: "Donation cache cleared successfully" });
    } catch (error) {
      console.error("Error clearing donation cache:", error);
      return res.status(500).json({ 
        message: "Failed to clear donation cache",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
