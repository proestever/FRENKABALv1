import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getWalletData, getTokenPrice, getWalletTransactionHistory, getSpecificTokenBalance, getApiCounterStats, resetApiCounter } from "./services/api";
import { 
  addDexScreenerPreferredToken, 
  removeDexScreenerPreferredToken, 
  getAllDexScreenerPreferredTokens 
} from "./services/price-source-service";
import { apiStatsService } from "./services/api-stats-service";
import { getDonations, getTopDonors, clearDonationCache } from "./services/donations";
import { getTokenPricesFromDexScreener } from "./services/dexscreener";
import { getDirectTokenBalances } from "./services/blockchain-service";
import { z } from "zod";
import { TokenLogo, insertBookmarkSchema, insertUserSchema } from "@shared/schema";
import { ethers } from "ethers";
import portfolioRoutes from "./routes/portfolio-routes";
import creditRoutes from "./routes/credit-routes";
import { format } from "date-fns";
import { dailyCreditsService } from "./services/daily-credits-service";
import { creditService } from "./services/credit-service";

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
      const { page = '1', limit = '100' } = req.query; // Default to page 1, limit 100
      const userId = req.headers['user-id'] ? parseInt(req.headers['user-id'] as string, 10) : null;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      // Convert query string parameters to numbers
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      
      // Validate pagination parameters
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ message: "Invalid page parameter" });
      }
      
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
        return res.status(400).json({ message: "Invalid limit parameter. Must be between 1 and 200" });
      }
      
      // Check if user has enough credits for this wallet search
      if (userId) {
        // Check if user has enough credits
        const hasEnoughCredits = await creditService.hasCreditsForWalletSearch(userId);
        if (!hasEnoughCredits) {
          return res.status(402).json({ 
            message: "Insufficient credits for wallet search. Please purchase more credits.",
            errorCode: "INSUFFICIENT_CREDITS" 
          });
        }
        
        // Deduct credits
        await creditService.deductCreditsForWalletSearch(userId);
      }
      
      const walletData = await getWalletData(address, pageNum, limitNum);
      
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

  // API route to get token prices - with backward compatibility
  app.get(["/api/token/price/:address", "/api/token-price/:address"], async (req, res) => {
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
  
  // API route to get ALL wallet tokens without pagination
  // Batch API for fetching multiple wallets at once
  app.post("/api/wallets/batch", async (req, res) => {
    try {
      const { addresses } = req.body;
      
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ message: "addresses must be an array" });
      }
      
      // Limit batch size for performance reasons
      const MAX_BATCH_SIZE = 10;
      let addressesToProcess = addresses;
      
      if (addresses.length > MAX_BATCH_SIZE) {
        console.log(`Batch size ${addresses.length} exceeds maximum (${MAX_BATCH_SIZE}). Processing first ${MAX_BATCH_SIZE} addresses.`);
        addressesToProcess = addresses.slice(0, MAX_BATCH_SIZE);
      }
      
      // Validate addresses
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      const validAddresses = addressesToProcess.filter(addr => 
        typeof addr === 'string' && addressRegex.test(addr)
      );
      
      if (validAddresses.length === 0) {
        return res.status(400).json({ message: "No valid wallet addresses provided" });
      }
      
      console.log(`Fetching data for ${validAddresses.length} wallets:`, validAddresses);
      
      // Process each wallet in parallel
      const results: Record<string, any> = {};
      
      await Promise.all(validAddresses.map(async (address) => {
        try {
          const walletData = await getWalletData(address, 1, 1000);
          results[address.toLowerCase()] = walletData;
        } catch (error) {
          console.error(`Error fetching data for wallet ${address}:`, error);
          results[address.toLowerCase()] = { error: error instanceof Error ? error.message : "Unknown error" };
        }
      }));
      
      return res.json(results);
    } catch (error) {
      console.error("Error in batch wallet fetch:", error);
      return res.status(500).json({ 
        message: "Failed to fetch wallet data in batch",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/wallet/:address/all", async (req, res) => {
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
      
      // Set loading progress to indicate we're fetching all tokens
      updateLoadingProgress({
        status: 'loading',
        message: 'Loading all wallet tokens in batches...',
        currentBatch: 0,
        totalBatches: 1
      });
      
      // Get all tokens without pagination (backend will still process in batches)
      // Pass a very large limit to essentially get all tokens
      const walletData = await getWalletData(address, 1, 1000);
      
      // Store this address in recent addresses (for future implementation)
      // This would save the recent searches in the database
      
      return res.json(walletData);
    } catch (error) {
      console.error("Error fetching all wallet tokens:", error);
      return res.status(500).json({ 
        message: "Failed to fetch wallet tokens",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API route to get wallet tokens directly from the blockchain 
  // This is useful for getting up-to-date balances immediately after a swap
  app.get("/api/wallet/:address/direct", async (req, res) => {
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
      
      // Set loading progress
      updateLoadingProgress({
        status: 'loading',
        message: 'Querying blockchain directly for real-time token balances...',
        currentBatch: 0,
        totalBatches: 1
      });
      
      // Get tokens directly from the blockchain
      const tokens = await getDirectTokenBalances(address);
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => {
        return sum + (token.value || 0);
      }, 0);
      
      // Format the response in the same way as getWalletData
      const walletData = {
        address,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance: tokens.find(t => t.isNative)?.balanceFormatted || null,
        plsPriceChange: tokens.find(t => t.isNative)?.priceChange24h || null,
        networkCount: 1, // Always PulseChain in this case
      };
      
      return res.json(walletData);
    } catch (error) {
      console.error("Error fetching direct wallet tokens:", error);
      return res.status(500).json({ 
        message: "Failed to fetch direct wallet tokens",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API route to get specific token balance for a wallet
  app.get("/api/wallet/:address/token/:tokenAddress", async (req, res) => {
    try {
      const { address, tokenAddress } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      if (!tokenAddress || typeof tokenAddress !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Validate ethereum addresses format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      if (!addressRegex.test(tokenAddress)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }
      
      // Get the specific token balance
      const tokenData = await getSpecificTokenBalance(address, tokenAddress);
      
      if (!tokenData) {
        return res.status(404).json({ message: "Token not found or no balance" });
      }
      
      return res.json(tokenData);
    } catch (error) {
      console.error("Error fetching specific token balance:", error);
      return res.status(500).json({ 
        message: "Failed to fetch specific token balance",
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
        
        // Check and award daily free credits
        try {
          const creditsAwarded = await dailyCreditsService.checkAndAwardDailyCredits(user.id);
          
          if (creditsAwarded > 0) {
            console.log(`Awarded ${creditsAwarded} daily free credits to user ${user.id}`);
          }
        } catch (creditsError) {
          console.error(`Error awarding daily credits to user ${user.id}:`, creditsError);
          // Continue even if there's an error with credits
        }
        
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
        
        // Award initial free credits to new user
        try {
          const creditsAwarded = await dailyCreditsService.checkAndAwardDailyCredits(user.id);
          
          if (creditsAwarded > 0) {
            console.log(`Awarded ${creditsAwarded} initial free credits to new user ${user.id}`);
          }
        } catch (creditsError) {
          console.error(`Error awarding initial credits to new user ${user.id}:`, creditsError);
          // Continue even if there's an error with credits
        }
        
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
      
      // Clear cache if refresh is requested
      if (refresh === 'true') {
        clearDonationCache();
        console.log("Cleared donation cache due to refresh request");
      }
      
      // Fetch donations for the specified address
      const donationRecords = await getDonations(address);
      
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

  // API route to get a specific token balance for a wallet
  app.get("/api/wallet/:walletAddress/token/:tokenAddress", async (req, res) => {
    try {
      const { walletAddress, tokenAddress } = req.params;
      
      // Validate wallet address
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate token address
      if (!tokenAddress || typeof tokenAddress !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Validate ethereum address format for both addresses
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(walletAddress)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      if (!addressRegex.test(tokenAddress)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }
      
      console.log(`Fetching specific token ${tokenAddress} for wallet ${walletAddress}`);
      
      // Get token balance using the specialized function
      const tokenData = await getSpecificTokenBalance(walletAddress, tokenAddress);
      
      if (!tokenData) {
        return res.status(404).json({ message: "Token not found or no balance" });
      }
      
      return res.json(tokenData);
    } catch (error) {
      console.error("Error fetching specific token:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token data",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Batch API for fetching multiple token prices at once
  app.post("/api/token-prices/batch", async (req, res) => {
    try {
      const { addresses } = req.body;
      
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ message: "addresses must be an array" });
      }
      
      // Limit batch size for performance reasons
      const MAX_BATCH_SIZE = 100;
      let addressesToProcess = addresses;
      
      if (addresses.length > MAX_BATCH_SIZE) {
        console.log(`Batch size ${addresses.length} exceeds maximum (${MAX_BATCH_SIZE}). Processing first ${MAX_BATCH_SIZE} addresses.`);
        addressesToProcess = addresses.slice(0, MAX_BATCH_SIZE);
      }
      
      // Normalize addresses
      const normalizedAddresses = addressesToProcess.map(addr => 
        typeof addr === 'string' ? addr.toLowerCase() : addr);
      
      // Remove duplicates for efficiency using alternative approach to avoid Set iteration issues
      const uniqueAddresses: string[] = [];
      normalizedAddresses.forEach(address => {
        if (!uniqueAddresses.includes(address)) {
          uniqueAddresses.push(address);
        }
      });
      
      console.log(`Processing batch price request for ${uniqueAddresses.length} unique tokens`);
      
      // Special case for native PLS token - add WPLS to our addresses if PLS is included
      const nativePulsechainAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      if (uniqueAddresses.includes(nativePulsechainAddress)) {
        // We don't need to fetch the wPLS price separately as DexScreener will handle that
        console.log('Batch includes native PLS token, will handle special case');
      }
      
      try {
        // Try to get prices from DexScreener in batch first
        const priceMap = await getTokenPricesFromDexScreener(uniqueAddresses);
        
        // If we have at least some prices, return what we got
        if (Object.keys(priceMap).length > 0) {
          console.log(`Returning ${Object.keys(priceMap).length} token prices from batch request`);
          return res.json(priceMap);
        } else {
          // If DexScreener returned no prices, try Moralis as fallback for a few tokens
          console.log('DexScreener returned no prices, trying Moralis fallback for some tokens');
          
          // Limit fallback to 10 tokens to avoid overwhelming Moralis API
          const fallbackAddresses = uniqueAddresses.slice(0, 10);
          const fallbackPrices: Record<string, number> = {};
          
          // Process in smaller batches to avoid rate limiting
          const BATCH_SIZE = 5;
          const fallbackBatches = [];
          
          for (let i = 0; i < fallbackAddresses.length; i += BATCH_SIZE) {
            fallbackBatches.push(fallbackAddresses.slice(i, i + BATCH_SIZE));
          }
          
          for (let i = 0; i < fallbackBatches.length; i++) {
            const batch = fallbackBatches[i];
            console.log(`Processing fallback token batch ${i+1}/${fallbackBatches.length}`);
            
            await Promise.all(batch.map(async (address) => {
              try {
                const priceData = await getTokenPrice(address);
                if (priceData?.usdPrice) {
                  fallbackPrices[address.toLowerCase()] = priceData.usdPrice;
                }
              } catch (err) {
                console.error(`Error fetching fallback price for ${address}:`, err);
              }
            }));
            
            // Add delay between batches
            if (i < fallbackBatches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          console.log(`Returning ${Object.keys(fallbackPrices).length} fallback token prices`);
          return res.json(fallbackPrices);
        }
      } catch (error) {
        console.error("Error in DexScreener batch token price fetch:", error);
        
        // Return empty map instead of failing - client will handle empty response
        return res.json({});
      }
    } catch (error) {
      console.error("Error in batch token price fetch:", error);
      return res.status(500).json({ 
        message: "Failed to fetch token prices in batch",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // API endpoint to get API call counter statistics
  app.get("/api/stats/api-calls", (_req, res) => {
    try {
      const stats = getApiCounterStats();
      return res.json(stats);
    } catch (error) {
      console.error("Error fetching API call stats:", error);
      return res.status(500).json({ 
        message: "Failed to fetch API call statistics",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API for retrieving historical API usage statistics
  // API endpoint to get detailed API usage statistics for a specific wallet
  app.get("/api/stats/wallet/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(walletAddress)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const stats = await apiStatsService.getWalletApiUsage(walletAddress);
      return res.json(stats);
    } catch (error) {
      console.error(`Error getting wallet API stats for ${req.params.walletAddress}:`, error);
      return res.status(500).json({ 
        message: "Failed to retrieve wallet API usage statistics",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API endpoint to get top wallets by API usage
  app.get("/api/stats/top-wallets", async (_req, res) => {
    try {
      const topWallets = await apiStatsService.getTopWalletAddresses(10);
      return res.json(topWallets);
    } catch (error) {
      console.error("Error getting top wallets:", error);
      return res.status(500).json({ 
        message: "Failed to retrieve top wallets by API usage",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  app.get("/api/stats/historical", async (req, res) => {
    try {
      // Check if user is admin (only admins can access historical stats)
      const adminAddress = "0x592139A3f8cf019f628A152FC1262B8aEf5B7199";
      const walletAddress = req.headers['wallet-address'] as string;
      
      if (!walletAddress || walletAddress.toLowerCase() !== adminAddress.toLowerCase()) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to access this resource'
        });
      }
      
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      
      // Get date for the specified number of days ago
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      
      // Get daily stats
      const dailyStats = await apiStatsService.getDailyStats(startDateStr);
      
      // Get all-time totals
      const totals = await apiStatsService.getTotalStats();
      
      // Get top wallets and endpoints
      const topWallets = await apiStatsService.getTopWalletAddresses(10);
      const topEndpoints = await apiStatsService.getTopEndpoints(10);
      
      res.json({
        daily: dailyStats,
        totals,
        topWallets,
        topEndpoints,
        period: {
          days,
          start: startDateStr,
          end: format(new Date(), 'yyyy-MM-dd')
        }
      });
    } catch (error) {
      console.error('Error fetching historical API stats:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve historical API statistics',
        message: (error as Error).message
      });
    }
  });
  
  // API endpoint to reset API call counter
  app.post("/api/stats/reset-counter", (_req, res) => {
    try {
      const result = resetApiCounter();
      return res.json({
        message: "API call counter reset successfully",
        previousStats: result
      });
    } catch (error) {
      console.error("Error resetting API call counter:", error);
      return res.status(500).json({ 
        message: "Failed to reset API call counter",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Register portfolio routes
  app.use("/api", portfolioRoutes);
  app.use("/api", creditRoutes);
  
  // API Routes for DexScreener preferred tokens management
  
  // Get all DexScreener preferred tokens
  app.get("/api/dexscreener-preferred-tokens", async (_req, res) => {
    try {
      const tokens = await getAllDexScreenerPreferredTokens();
      return res.json(tokens);
    } catch (error) {
      console.error("Error fetching DexScreener preferred tokens:", error);
      return res.status(500).json({ 
        message: "Failed to fetch DexScreener preferred tokens",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Add a token to DexScreener preferred list
  app.post("/api/dexscreener-preferred-tokens", async (req, res) => {
    try {
      const { tokenAddress, reason, symbol, name } = req.body;
      
      if (!tokenAddress || typeof tokenAddress !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Validate token address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(tokenAddress)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }
      
      await addDexScreenerPreferredToken({
        tokenAddress,
        reason: reason || null,
        symbol: symbol || null,
        name: name || null
      });
      
      return res.json({ 
        message: "Token added to DexScreener preferred list",
        tokenAddress
      });
    } catch (error) {
      console.error("Error adding token to DexScreener preferred list:", error);
      return res.status(500).json({ 
        message: "Failed to add token to DexScreener preferred list",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Remove a token from DexScreener preferred list
  app.delete("/api/dexscreener-preferred-tokens/:tokenAddress", async (req, res) => {
    try {
      const { tokenAddress } = req.params;
      
      if (!tokenAddress || typeof tokenAddress !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Validate token address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(tokenAddress)) {
        return res.status(400).json({ message: "Invalid token address format" });
      }
      
      const success = await removeDexScreenerPreferredToken(tokenAddress);
      
      if (success) {
        return res.json({ 
          message: "Token removed from DexScreener preferred list",
          tokenAddress
        });
      } else {
        return res.status(404).json({ 
          message: "Token not found in DexScreener preferred list",
          tokenAddress
        });
      }
    } catch (error) {
      console.error("Error removing token from DexScreener preferred list:", error);
      return res.status(500).json({ 
        message: "Failed to remove token from DexScreener preferred list",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
