import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { portfolios, insertPortfolioSchema, portfolioAddresses, insertPortfolioAddressSchema } from "@shared/schema";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

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

// Get a specific portfolio by slug (must be defined before :id route)
router.get("/portfolios/slug/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ message: "Invalid portfolio slug" });
    }
    
    const portfolio = await storage.getPortfolioBySlug(slug);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    return res.json(portfolio);
  } catch (error) {
    console.error("Error fetching portfolio by slug:", error);
    return res.status(500).json({ message: "Failed to fetch portfolio" });
  }
});

// Get a specific portfolio by public code
router.get("/portfolios/public/:code", async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ message: "Invalid portfolio code" });
    }
    
    const portfolio = await storage.getPortfolioByPublicCode(code.toUpperCase());
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    return res.json(portfolio);
  } catch (error) {
    console.error("Error fetching portfolio by public code:", error);
    return res.status(500).json({ message: "Failed to fetch portfolio" });
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

// Get all addresses in a portfolio by slug
router.get("/portfolios/slug/:slug/addresses", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ message: "Invalid portfolio slug" });
    }
    
    const portfolio = await storage.getPortfolioBySlug(slug);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    const addresses = await storage.getPortfolioAddresses(portfolio.id);
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
        console.log(`Attempting to add ${walletAddress} to bookmarks for user ${userId}`);
        
        // Check if this wallet is already bookmarked by this user
        const existingBookmark = await storage.getBookmarkByAddress(userId, walletAddress);
        console.log(`Existing bookmark found: ${existingBookmark ? 'Yes' : 'No'}`);
        
        if (!existingBookmark) {
          // Create bookmark data
          const bookmarkData = {
            userId,
            walletAddress,
            label: validatedData.label || "Portfolio Address", // Default label if none provided
            notes: null,
            isFavorite: false,
          };
          
          console.log(`Creating bookmark with data:`, bookmarkData);
          
          // Add to bookmarks
          try {
            const newBookmark = await storage.createBookmark(bookmarkData);
            console.log(`Added wallet address ${walletAddress} to bookmarks for user ${userId}`, newBookmark);
          } catch (innerError) {
            console.error(`Failed to create bookmark for ${walletAddress}:`, innerError);
          }
        } else {
          console.log(`Wallet ${walletAddress} already exists in bookmarks with id ${existingBookmark.id}`);
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

// Export portfolio addresses as CSV
router.get("/portfolios/:id/export", async (req: Request, res: Response) => {
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
    
    // Create CSV data
    const csvData = addresses.map(addr => ({
      Address: addr.walletAddress,
      Label: addr.label || ''
    }));
    
    // Generate CSV string
    const csv = stringify(csvData, {
      header: true,
      columns: ['Address', 'Label']
    });
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${portfolio.name.replace(/[^a-z0-9]/gi, '_')}_addresses.csv"`);
    
    return res.send(csv);
  } catch (error) {
    console.error("Error exporting portfolio addresses:", error);
    return res.status(500).json({ message: "Failed to export portfolio addresses" });
  }
});

// Import addresses from CSV
router.post("/portfolios/:id/import", async (req: Request, res: Response) => {
  try {
    const portfolioId = parseInt(req.params.id);
    if (isNaN(portfolioId)) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }
    
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ message: "CSV content is required" });
    }
    
    try {
      // Parse CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      
      // Validate and prepare addresses
      const validAddresses = [];
      const errors = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const address = record.Address || record.address || record.Wallet || record.wallet;
        const label = record.Label || record.label || record.Name || record.name || '';
        
        if (!address) {
          errors.push(`Row ${i + 2}: Missing address`);
          continue;
        }
        
        // Basic Ethereum address validation
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          errors.push(`Row ${i + 2}: Invalid address format "${address}"`);
          continue;
        }
        
        validAddresses.push({
          portfolioId,
          walletAddress: address.toLowerCase(),
          label: label.trim()
        });
      }
      
      if (errors.length > 0 && validAddresses.length === 0) {
        return res.status(400).json({ 
          message: "No valid addresses found",
          errors 
        });
      }
      
      // Add or update addresses in portfolio
      const results = [];
      const importErrors = [];
      
      for (const addressData of validAddresses) {
        try {
          // Check if address already exists in portfolio
          const existingAddress = await storage.getPortfolioAddressByWallet(portfolioId, addressData.walletAddress);
          
          let resultAddress;
          if (existingAddress) {
            // Update existing address with new label
            resultAddress = await storage.updatePortfolioAddress(existingAddress.id, {
              label: addressData.label
            });
            console.log(`Updated existing address ${addressData.walletAddress} with new label: ${addressData.label}`);
          } else {
            // Add new address to portfolio
            resultAddress = await storage.addAddressToPortfolio(addressData);
            console.log(`Added new address ${addressData.walletAddress} to portfolio`);
          }
          
          results.push(resultAddress);
          
          // Also add to or update bookmarks if user is logged in
          if (portfolio.userId !== null) {
            try {
              const existingBookmark = await storage.getBookmarkByAddress(portfolio.userId, addressData.walletAddress);
              if (existingBookmark) {
                // Update existing bookmark with new label
                await storage.updateBookmark(existingBookmark.id, {
                  label: addressData.label || "Portfolio Address"
                });
              } else {
                // Create new bookmark
                await storage.createBookmark({
                  userId: portfolio.userId,
                  walletAddress: addressData.walletAddress,
                  label: addressData.label || "Portfolio Address",
                  notes: null,
                  isFavorite: false,
                });
              }
            } catch (bookmarkError) {
              console.error("Error adding/updating bookmark:", bookmarkError);
            }
          }
        } catch (error: any) {
          importErrors.push(`Failed to process ${addressData.walletAddress}: ${error?.message || 'Unknown error'}`);
        }
      }
      
      return res.json({
        success: true,
        imported: results.length,
        total: validAddresses.length,
        parseErrors: errors,
        importErrors,
        addresses: results
      });
      
    } catch (parseError) {
      console.error("CSV parse error:", parseError);
      return res.status(400).json({ 
        message: "Invalid CSV format",
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      });
    }
    
  } catch (error) {
    console.error("Error importing portfolio addresses:", error);
    return res.status(500).json({ message: "Failed to import portfolio addresses" });
  }
});

export default router;