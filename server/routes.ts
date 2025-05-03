import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getWalletData, getTokenPrice } from "./services/api";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.get("/api/token-logo/:address", async (req, res) => {
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
          }
        } catch (err) {
          console.error(`Error fetching token data from Moralis: ${err}`);
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
