import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getWalletData, getTokenPrice } from "./services/api";
import { z } from "zod";

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
            logoUrl: '/assets/pls-logo.png',
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
            logoUrl: '/assets/pls-logo.png', // Reference to static asset we're serving
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
      
      if (logo) {
        return res.json(logo);
      } else {
        return res.status(404).json({ message: "Token logo not found" });
      }
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

  const httpServer = createServer(app);

  return httpServer;
}
