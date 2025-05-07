import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { portfolios, insertPortfolioSchema, portfolioAddresses, insertPortfolioAddressSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get all portfolios for a user
router.get("/users/:userId/portfolios", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const userPortfolios = await storage.getPortfolios(userId);
    return res.json(userPortfolios);
  } catch (error) {
    console.error("Error fetching portfolios:", error);
    return res.status(500).json({ message: "Failed to fetch portfolios" });
  }
});

// Get a specific portfolio by ID
router.get("/portfolios/:id", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    return res.json(portfolio);
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    return res.status(500).json({ message: "Failed to fetch portfolio" });
  }
});

// Create a new portfolio
router.post("/portfolios", async (req: Request, res: Response) => {
  try {
    const validatedData = insertPortfolioSchema.parse(req.body);
    const newPortfolio = await storage.createPortfolio(validatedData);
    return res.status(201).json(newPortfolio);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid portfolio data", errors: error.errors });
    }
    console.error("Error creating portfolio:", error);
    return res.status(500).json({ message: "Failed to create portfolio" });
  }
});

// Update a portfolio
router.patch("/portfolios/:id", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    // Validate only the fields that are provided
    const validatedData = insertPortfolioSchema.partial().parse(req.body);
    const updatedPortfolio = await storage.updatePortfolio(portfolioId, validatedData);
    return res.json(updatedPortfolio);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid portfolio data", errors: error.errors });
    }
    console.error("Error updating portfolio:", error);
    return res.status(500).json({ message: "Failed to update portfolio" });
  }
});

// Delete a portfolio
router.delete("/portfolios/:id", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const deleted = await storage.deletePortfolio(portfolioId);
    if (!deleted) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting portfolio:", error);
    return res.status(500).json({ message: "Failed to delete portfolio" });
  }
});

// Get all addresses in a portfolio
router.get("/portfolios/:id/addresses", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    const addresses = await storage.getPortfolioAddresses(portfolioId);
    return res.json(addresses);
  } catch (error) {
    console.error("Error fetching portfolio addresses:", error);
    return res.status(500).json({ message: "Failed to fetch portfolio addresses" });
  }
});

// Add an address to a portfolio
router.post("/portfolios/:id/addresses", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    // Create address data with the portfolio ID
    const addressData = {
      ...req.body,
      portfolioId,
    };
    
    const validatedData = insertPortfolioAddressSchema.parse(addressData);
    const newAddress = await storage.addAddressToPortfolio(validatedData);
    
    // Also add this address to bookmarks if it's not already bookmarked
    try {
      const userId = portfolio.userId;
      // Skip if userId is null (shouldn't happen in practice)
      if (userId === null) {
        console.log("Cannot add bookmark: Portfolio has no userId");
      } else {
        const walletAddress = validatedData.walletAddress;
        
        // Check if this wallet is already bookmarked by this user
        const existingBookmark = await storage.getBookmarkByAddress(userId, walletAddress);
        
        if (!existingBookmark) {
          // Create bookmark data
          const bookmarkData = {
            userId,
            walletAddress,
            label: validatedData.label || "Portfolio Address", // Default label if none provided
            notes: null,
            isFavorite: false,
          };
          
          // Add to bookmarks
          await storage.createBookmark(bookmarkData);
          console.log(`Added wallet address ${walletAddress} to bookmarks for user ${userId}`);
        }
      }
    } catch (bookmarkError) {
      // Just log the error but don't fail the request
      console.error("Error adding address to bookmarks:", bookmarkError);
    }
    
    return res.status(201).json(newAddress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid address data", errors: error.errors });
    }
    console.error("Error adding address to portfolio:", error);
    return res.status(500).json({ message: "Failed to add address to portfolio" });
  }
});

// Update a portfolio address
router.patch("/portfolio-addresses/:id", async (req: Request, res: Response) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ message: "Invalid address ID" });
    }
    
    const validatedData = insertPortfolioAddressSchema.partial().parse(req.body);
    const updatedAddress = await storage.updatePortfolioAddress(addressId, validatedData);
    
    // Also update the bookmark with the same address if it exists
    if (validatedData.label !== undefined) {
      try {
        // First, get the portfolio to get the userId
        const portfolio = await storage.getPortfolio(updatedAddress.portfolioId);
        if (portfolio && portfolio.userId !== null) {
          const userId = portfolio.userId;
          const walletAddress = updatedAddress.walletAddress;
          
          // Find the bookmark for this address
          const existingBookmark = await storage.getBookmarkByAddress(userId, walletAddress);
          
          if (existingBookmark) {
            // Update the bookmark with the new label
            // Make sure to handle null by providing a default value
            const newLabel = validatedData.label || "Portfolio Address";
            await storage.updateBookmark(existingBookmark.id, {
              label: newLabel
            });
            console.log(`Updated bookmark label for wallet ${walletAddress} to "${newLabel}"`);
          }
        }
      } catch (bookmarkError) {
        // Just log the error but don't fail the request
        console.error("Error updating bookmark:", bookmarkError);
      }
    }
    
    return res.json(updatedAddress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid address data", errors: error.errors });
    }
    console.error("Error updating portfolio address:", error);
    return res.status(500).json({ message: "Failed to update portfolio address" });
  }
});

// Remove an address from a portfolio
router.delete("/portfolio-addresses/:id", async (req: Request, res: Response) => {
  try {
    const addressId = parseInt(req.params.id);
    if (isNaN(addressId)) {
      return res.status(400).json({ message: "Invalid address ID" });
    }
    
    const deleted = await storage.removeAddressFromPortfolio(addressId);
    if (!deleted) {
      return res.status(404).json({ message: "Portfolio address not found" });
    }
    
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing address from portfolio:", error);
    return res.status(500).json({ message: "Failed to remove address from portfolio" });
  }
});

// Special endpoint to get all wallet addresses in a portfolio (for multi-wallet search)
router.get("/portfolios/:id/wallet-addresses", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    // Get all addresses in the portfolio
    const addresses = await storage.getPortfolioAddresses(portfolioId);
    
    // Extract just the wallet addresses as an array
    const walletAddresses = addresses.map(addr => addr.walletAddress);
    
    return res.json({
      portfolioId,
      portfolioName: portfolio.name,
      walletAddresses
    });
  } catch (error) {
    console.error("Error fetching portfolio wallet addresses:", error);
    return res.status(500).json({ message: "Failed to fetch portfolio wallet addresses" });
  }
});

export default router;