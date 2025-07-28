import type { Express } from "express";
import { createServer, type Server } from "http";
import fetch from "node-fetch";
import { storage } from "./storage";
import { getWalletData, getTokenPrice, getWalletTransactionHistory, getSpecificTokenBalance, getApiCounterStats, resetApiCounter, getTransactionDetails, getTokenInfo } from "./services/api";
import { 
  addDexScreenerPreferredToken, 
  removeDexScreenerPreferredToken, 
  getAllDexScreenerPreferredTokens 
} from "./services/price-source-service";
import { apiStatsService } from "./services/api-stats-service";
import { getDonations, getTopDonors, clearDonationCache } from "./services/donations";
import { getTokenPricesFromDexScreener, getTokenPriceFromDexScreener } from "./services/dexscreener";

import { calculateBalancesFromTransferHistory, getTransferHistoryWithBalances } from "./services/transfer-history-service";

import { getProviderHealth, switchToProvider, resetFailedProviders } from "./services/rpc-provider";
import { getScannerTokenBalances, getFastScannerTokenBalances } from "./services/scanner-balance-service";
import { getScannerTransactionHistory, getFullScannerTransactionHistory } from "./services/scanner-transaction-service";
import { balanceCacheManager } from "./services/balance-cache-manager";
import { z } from "zod";
import { TokenLogo, insertBookmarkSchema, insertUserSchema } from "@shared/schema";
import { ethers } from "ethers";
import portfolioRoutes from "./routes/portfolio-routes";
import { format } from "date-fns";


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
      const { page = '1', limit = '100', force = 'false' } = req.query; // Default to page 1, limit 100, no force refresh
      
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
      const forceRefresh = force === 'true';
      
      // Validate pagination parameters
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ message: "Invalid page parameter" });
      }
      
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
        return res.status(400).json({ message: "Invalid limit parameter. Must be between 1 and 200" });
      }
      
      console.log(`Fetching wallet data for ${address}, force refresh: ${forceRefresh}`);
      const walletData = await getWalletData(address, pageNum, limitNum, forceRefresh);
      
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
  
  


  // API route to calculate wallet balances from complete transfer history
  app.get("/api/wallet/:address/transfer-history-balances", async (req, res) => {
    try {
      const { address } = req.params;
      const { fromBlock = '0', toBlock = 'latest' } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      console.log(`Calculating balances from transfer history for ${address}`);
      
      // Convert block parameters
      const startBlock = fromBlock === '0' ? 0 : parseInt(fromBlock as string, 10);
      const endBlock = toBlock === 'latest' ? 'latest' : parseInt(toBlock as string, 10);
      
      // Calculate balances from transfer history
      const result = await getTransferHistoryWithBalances(
        address,
        startBlock,
        endBlock === 'latest' ? undefined : endBlock
      );
      
      // Calculate total value
      const totalValue = result.tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Find PLS balance
      const plsToken = result.tokens.find(t => t.isNative);
      const plsBalance = plsToken ? plsToken.balanceFormatted : 0;
      
      // Return in the same format as regular wallet data
      return res.json({
        address,
        tokens: result.tokens,
        totalValue,
        tokenCount: result.tokens.length,
        plsBalance,
        plsPriceChange: null,
        networkCount: 1,
        blockRange: result.blockRange,
        calculationMethod: 'transfer-history',
        message: 'Balances calculated from complete on-chain transfer history'
      });
    } catch (error) {
      console.error("Error calculating balances from transfer history:", error);
      return res.status(500).json({ 
        message: "Failed to calculate balances from transfer history",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // API route to get wallet balances using PulseChain Scanner API + recent blocks
  app.get("/api/wallet/:address/scanner-balances", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      console.log(`Getting balances using Scanner API for ${address}`);
      
      const startTime = Date.now();
      const tokens = await getScannerTokenBalances(address);
      const endTime = Date.now();
      
      console.log(`Scanner balance fetch completed in ${endTime - startTime}ms`);
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Find PLS balance
      const plsToken = tokens.find(t => t.isNative);
      const plsBalance = plsToken ? plsToken.balanceFormatted : 0;
      const plsPriceChange = plsToken ? plsToken.priceChange24h : null;
      
      return res.json({
        address,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance,
        plsPriceChange,
        networkCount: 1,
        fetchMethod: 'scanner'
      });
    } catch (error) {
      console.error("Error fetching scanner balances:", error);
      return res.status(500).json({ 
        message: "Failed to fetch scanner balances",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // API route for fast wallet balances (for portfolios) - uses original scanner without enhanced features
  app.get("/api/wallet/:address/fast-balances", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      console.log(`Getting fast balances for ${address}`);
      
      const startTime = Date.now();
      
      // Use the regular scanner API service instead of enhanced scanner
      const tokens = await getFastScannerTokenBalances(address);
      
      const endTime = Date.now();
      
      console.log(`Fast balance fetch completed in ${endTime - startTime}ms`);
      
      // Calculate total value - for fast scanner this should always be 0
      // since prices are calculated client-side
      let totalValue = 0;
      
      // Just in case any values are set, apply sanity checks
      if (tokens.some(t => t.value && t.value > 0)) {
        totalValue = tokens.reduce((sum, token) => {
          // Skip if value is 0 or undefined (client will calculate)
          if (!token.value || token.value === 0) return sum;
          // Ensure value is a valid number
          const value = parseFloat(token.value.toString());
          if (isNaN(value) || !isFinite(value)) {
            console.warn(`Skipping token ${token.symbol} with invalid value: ${token.value}`);
            return sum;
          }
          return sum + value;
        }, 0);
      }
      
      // Find PLS balance
      const plsToken = tokens.find(t => t.isNative);
      const plsBalance = plsToken ? plsToken.balanceFormatted : 0;
      const plsPriceChange = plsToken ? plsToken.priceChange24h : null;
      
      return res.json({
        address,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance,
        plsPriceChange,
        networkCount: 1,
        fetchMethod: 'fast-scanner'
      });
    } catch (error) {
      console.error("Error fetching fast balances:", error);
      return res.status(500).json({ 
        message: "Failed to fetch fast balances",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // API route to force refresh wallet balances with real-time data
  app.get("/api/wallet/:address/refresh-balances", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      console.log(`Force refreshing balances for ${address} with real-time data`);
      
      const startTime = Date.now();
      
      // Use enhanced scanner which now includes improved recent block scanning
      const tokens = await getScannerTokenBalances(address);
      
      const endTime = Date.now();
      console.log(`Real-time refresh completed in ${endTime - startTime}ms`);
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Find PLS balance
      const plsToken = tokens.find(t => t.isNative);
      const plsBalance = plsToken ? plsToken.balanceFormatted : 0;
      const plsPriceChange = plsToken ? plsToken.priceChange24h : null;
      
      return res.json({
        address,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance,
        plsPriceChange,
        networkCount: 1,
        fetchMethod: 'real-time-refresh',
        refreshedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in real-time refresh:", error);
      return res.status(500).json({
        message: "Failed to refresh wallet balances",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // API route to get live-tracked wallet balances with real-time updates
  app.get("/api/wallet/:address/live-balances", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      console.log(`Getting live-tracked balances for ${address}`);
      
      // Get balances with live updates
      const tokens = await balanceCacheManager.getBalancesWithLiveUpdates(address);
      
      // Calculate total value
      const totalValue = tokens.reduce((sum, token) => sum + (token.value || 0), 0);
      
      // Find PLS balance
      const plsToken = tokens.find(t => t.isNative);
      const plsBalance = plsToken ? plsToken.balanceFormatted : 0;
      const plsPriceChange = plsToken ? plsToken.priceChange24h : null;
      
      return res.json({
        address,
        tokens,
        totalValue,
        tokenCount: tokens.length,
        plsBalance,
        plsPriceChange,
        networkCount: 1,
        fetchMethod: 'live-websocket',
        isLiveTracking: true
      });
    } catch (error) {
      console.error("Error getting live balances:", error);
      return res.status(500).json({
        message: "Failed to get live balances",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // API route to get WebSocket balance tracking status
  app.get("/api/websocket-status", (_req, res) => {
    const status = balanceCacheManager.getStatus();
    return res.json(status);
  });
  
  // API route to stop tracking a wallet
  app.delete("/api/wallet/:address/tracking", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      await balanceCacheManager.untrackWallet(address);
      
      return res.json({ message: "Stopped tracking wallet", address });
    } catch (error) {
      console.error("Error stopping wallet tracking:", error);
      return res.status(500).json({
        message: "Failed to stop wallet tracking",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // API route to get transaction history using PulseChain Scanner API + recent blocks
  app.get("/api/wallet/:address/scanner-transactions", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = '100', cursor } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const limitNum = Math.min(parseInt(limit as string) || 100, 500);
      
      console.log(`Getting transaction history using Scanner API for ${address}`);
      
      const { transactions, nextCursor } = await getScannerTransactionHistory(
        address,
        limitNum,
        cursor as string | undefined
      );
      
      return res.json({
        result: transactions,
        cursor: nextCursor,
        page: 1,
        page_size: limitNum
      });
    } catch (error) {
      console.error("Error fetching scanner transactions:", error);
      return res.status(500).json({ 
        message: "Failed to fetch scanner transactions",
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
      const { force = 'false' } = req.query; // Get force refresh parameter
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format (0x followed by 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const forceRefresh = force === 'true';
      
      // Set loading progress to indicate we're fetching all tokens
      // Silent loading - no progress updates
      
      // Get all tokens without pagination (backend will still process in batches)
      // Pass a very large limit to essentially get all tokens
      console.log(`Fetching all tokens for ${address}, force refresh: ${forceRefresh}`);
      const walletData = await getWalletData(address, 1, 1000, forceRefresh);
      
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
  

  
  // New endpoint for force refreshing wallet data (bypass cache completely)
  app.get("/api/wallet/:address/force-refresh", async (req, res) => {
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
      
      // Set loading progress message
      // Silent loading - no progress updates
      
      console.log(`Force refreshing wallet data for ${address} - explicitly bypassing cache`);
      
      // Force refresh wallet data
      
      // Get fresh data with force refresh parameter
      const walletData = await getWalletData(address, 1, 1000, true);
      
      console.log(`Successfully refreshed data with ${walletData.tokens.length} tokens`);
      
      return res.json(walletData);
    } catch (error) {
      console.error("Error force refreshing wallet data:", error);
      
      // Silent loading - no progress updates
      
      return res.status(500).json({ 
        message: "Failed to force refresh wallet data",
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
      // Allow up to 200 transactions per request for detailed history
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 150, 200);
      
      // Call the API service with pagination parameters
      const transactionHistory = await getWalletTransactionHistory(
        address, 
        parsedLimit, 
        cursor as string | null
      );
      
      // Return structured response even if there are no transactions
      if (!transactionHistory) {
        return res.status(500).json({ 
          message: "Failed to fetch transaction history",
          error: "Unknown error"
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
  
  // Scanner-based transaction history endpoint for ultra-fast loading
  app.get("/api/wallet/:address/scanner-transactions", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = '200', cursor } = req.query; // Increased default limit to 200
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Check if this is a portfolio bundle
      if (address.toLowerCase().startsWith('portfolio:')) {
        // For portfolio bundles, we need to aggregate transactions from all addresses
        const portfolioCode = address.substring(10);
        console.log(`Getting portfolio transactions for: ${portfolioCode}`);
        
        try {
          // Find the portfolio by share code
          const portfolio = await storage.getPortfolioByPublicCode(portfolioCode);
          if (!portfolio) {
            return res.status(404).json({ message: "Portfolio not found" });
          }
          
          // Get all addresses in the portfolio
          const addresses = await storage.getPortfolioAddresses(portfolio.id);
          if (!addresses || addresses.length === 0) {
            return res.json({ result: [], page: 1, page_size: parseInt(limit as string, 10) });
          }
          
          // For now, return transactions from the first address
          // In a future enhancement, we could aggregate transactions from all addresses
          const primaryAddress = addresses[0].walletAddress;
          
          // Import the scanner transaction service
          const { getScannerTransactionHistory } = await import('./services/scanner-transaction-service.js');
          
          const parsedLimit = Math.min(parseInt(limit as string, 10) || 200, 500);
          const result = await getScannerTransactionHistory(primaryAddress, parsedLimit, cursor as string | undefined);
          
          return res.json(result);
        } catch (error) {
          console.error("Error fetching portfolio transactions:", error);
          return res.status(500).json({ 
            message: "Failed to fetch portfolio transactions",
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 200, 500);
      
      // Import the scanner transaction service
      const { getScannerTransactionHistory } = await import('./services/scanner-transaction-service.js');
      
      console.log(`Fetching transaction history using Scanner API for ${address}, limit: ${parsedLimit}`);
      
      // Fetch transactions using scanner API
      const result = await getScannerTransactionHistory(address, parsedLimit, cursor as string | undefined);
      
      return res.json(result);
    } catch (error) {
      console.error("Error fetching scanner transactions:", error);
      return res.status(500).json({ 
        message: "Failed to fetch transaction history",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Legacy direct blockchain transaction history endpoint
  app.get("/api/wallet/:address/blockchain-transactions", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = '50', startBlock } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid wallet address" });
      }
      
      // Validate ethereum address format
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ message: "Invalid wallet address format" });
      }
      
      const parsedLimit = Math.min(parseInt(limit as string, 10) || 50, 100);
      const parsedStartBlock = startBlock ? parseInt(startBlock as string, 10) : undefined;
      
      // Import the fast blockchain service
      const { fetchTransactionsFast, batchFetchTokenMetadata } = await import('./services/fast-blockchain-service.js');
      
      console.log(`Fast fetching blockchain transactions for ${address}, limit: ${parsedLimit}, startBlock: ${parsedStartBlock || 'latest'}`);
      
      // Fetch transactions using the optimized fast method
      const result = await fetchTransactionsFast(address, parsedLimit, parsedStartBlock);
      
      // Collect unique token addresses for metadata fetching
      const tokenAddresses = new Set<string>();
      result.transactions.forEach(tx => {
        tx.erc20_transfers?.forEach(transfer => {
          if (transfer.address) {
            tokenAddresses.add(transfer.address.toLowerCase());
          }
        });
      });
      
      // Batch fetch token metadata
      if (tokenAddresses.size > 0) {
        console.log(`Fetching metadata for ${tokenAddresses.size} tokens`);
        const tokenMetadata = await batchFetchTokenMetadata(Array.from(tokenAddresses));
        
        // Update transfers with token metadata
        result.transactions.forEach(tx => {
          tx.erc20_transfers?.forEach(transfer => {
            if (transfer.address) {
              const metadata = tokenMetadata[transfer.address.toLowerCase()];
              if (metadata) {
                transfer.token_name = metadata.name;
                transfer.token_symbol = metadata.symbol;
                transfer.token_decimals = metadata.decimals.toString();
                
                // Calculate formatted value
                const decimals = metadata.decimals;
                const value = BigInt(transfer.value);
                const divisor = BigInt(10 ** decimals);
                const integerPart = value / divisor;
                const fractionalPart = value % divisor;
                transfer.value_formatted = `${integerPart}.${fractionalPart.toString().padStart(decimals, '0')}`;
              }
            }
          });
        });
      }
      
      // Format response to match expected structure
      return res.json({
        result: result.transactions,
        cursor: result.hasMore ? result.lastBlock.toString() : undefined,
        page: 1,
        page_size: parsedLimit
      });
    } catch (error) {
      console.error("Error fetching blockchain transactions:", error);
      return res.status(500).json({ 
        message: "Failed to fetch blockchain transactions",
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
  
  // Endpoint to save logos fetched by clients from DexScreener
  app.post("/api/token-logos/save-from-client", async (req, res) => {
    try {
      const { tokenAddress, logoUrl, symbol, name } = req.body;
      
      // Validate input
      if (!tokenAddress || !logoUrl) {
        return res.status(400).json({ message: "tokenAddress and logoUrl are required" });
      }
      
      // Save logo to database
      const savedLogo = await storage.saveTokenLogo({
        tokenAddress: tokenAddress.toLowerCase(),
        logoUrl,
        symbol: symbol || "",
        name: name || "",
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`Client-side logo saved for ${tokenAddress}: ${logoUrl}`);
      return res.json(savedLogo);
    } catch (error) {
      console.error("Error saving client-side logo:", error);
      return res.status(500).json({ 
        message: "Failed to save logo",
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
              // Download and store the image
              const { downloadImageAsBase64 } = await import('./services/image-storage-service.js');
              const imageData = await downloadImageAsBase64(tokenData.tokenLogo);
              
              const newLogo = {
                tokenAddress: address,
                logoUrl: tokenData.tokenLogo,
                imageData: imageData?.imageData || undefined,
                imageType: imageData?.imageType || undefined,
                symbol: tokenData.tokenSymbol || "",
                name: tokenData.tokenName || "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store in database
              const savedLogo = await storage.saveTokenLogo(newLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
            } else {
              // If Moralis doesn't have a logo, save null logo to indicate we tried
              const defaultLogo = {
                tokenAddress: address,
                logoUrl: null,
                symbol: tokenData?.tokenSymbol || "",
                name: tokenData?.tokenName || "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store null logo in database to prevent future API calls
              const savedLogo = await storage.saveTokenLogo(defaultLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
              console.log(`No logo found for token ${address}, saved null logo`);
            }
          } catch (error) {
            console.error(`Error fetching logo for ${address} in batch:`, error);
            
            // Even on error, save a null logo to prevent future API calls
            try {
              const defaultLogo = {
                tokenAddress: address,
                logoUrl: null,
                symbol: "",
                name: "",
                lastUpdated: new Date().toISOString()
              };
              
              // Store null logo in database
              const savedLogo = await storage.saveTokenLogo(defaultLogo);
              
              // Add to response map
              logoMap[address] = savedLogo;
              console.log(`Saved null logo for token ${address} after fetch error`);
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

  // Transaction details endpoint for multicall token extraction
  app.get("/api/transaction/:hash/details", async (req, res) => {
    try {
      const { hash } = req.params;
      
      if (!hash || hash.length !== 66) {
        return res.status(400).json({ error: "Invalid transaction hash" });
      }

      const result = await getTransactionDetails(hash);
      res.json(result);
    } catch (error) {
      console.error("Error fetching transaction details:", error);
      res.status(500).json({ error: "Failed to fetch transaction details" });
    }
  });

  // Token info endpoint for complete token metadata
  app.get("/api/token/:address/info", async (req, res) => {
    try {
      const { address } = req.params;
      
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        return res.status(400).json({ error: "Invalid token address" });
      }

      const result = await getTokenInfo(address);
      res.json(result);
    } catch (error) {
      console.error("Error fetching token info:", error);
      res.status(500).json({ error: "Failed to fetch token info" });
    }
  });
  
  // Test endpoint for DexScreener logo fetching
  app.get("/api/token/:address/logo-test", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ message: "Invalid token address" });
      }
      
      // Import the functions we need
      const { getTokenPriceDataFromDexScreener, getTokenLogoFromDexScreener } = await import('./services/dexscreener');
      
      // Try to get price data first (which includes logo)
      const priceData = await getTokenPriceDataFromDexScreener(address);
      
      // Also try the direct logo fetch
      const directLogo = await getTokenLogoFromDexScreener(address);
      
      res.json({
        address,
        priceData,
        directLogo,
        hasLogo: !!(priceData?.logo || directLogo)
      });
    } catch (error) {
      console.error('Error testing logo fetch:', error);
      res.status(500).json({ message: "Error testing logo fetch", error: error instanceof Error ? error.message : "Unknown error" });
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
      
      // If not found in database, try to fetch from DexScreener first
      if (!logo) {
        try {
          console.log(`Fetching token info from DexScreener for ${address}`);
          const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
          
          if (response.ok) {
            const data = await response.json() as any;
            
            if (data.pairs && data.pairs.length > 0) {
              const pair = data.pairs[0];
              const tokenInfo = pair.baseToken.address.toLowerCase() === address.toLowerCase() 
                ? pair.baseToken 
                : pair.quoteToken;
              
              // Try to get logo from known sources based on token info
              let logoUrl: string | null = null; // Default is null, not FrenKabal logo
              
              // First, check if DexScreener provides a logo in the info field
              if (pair.info && pair.info.imageUrl) {
                logoUrl = pair.info.imageUrl;
                console.log(`Found DexScreener logo for ${address}: ${logoUrl}`);
              } else if (tokenInfo.symbol) {
                const symbol = tokenInfo.symbol.toLowerCase();
                
                // Check if it's a known token with a specific logo
                const knownLogos: Record<string, string> = {
                  'pls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
                  'wpls': 'https://tokens.app.pulsex.com/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
                  'plsx': 'https://tokens.app.pulsex.com/images/tokens/0x15D38573d2feeb82e7ad5187aB8c5D52810B6f40.png',
                  'hex': 'https://tokens.app.pulsex.com/images/tokens/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.png',
                  'weth': 'https://tokens.app.pulsex.com/images/tokens/0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C.png',
                  'usdc': 'https://tokens.app.pulsex.com/images/tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.png',
                  'usdt': 'https://tokens.app.pulsex.com/images/tokens/0xdAC17F958D2ee523a2206206994597C13D831ec7.png',
                  'inc': 'https://tokens.app.pulsex.com/images/tokens/0x6c203a555824ec90a215f37916cf8db58ebe2fa3.png'
                };
                
                if (knownLogos[symbol]) {
                  logoUrl = knownLogos[symbol];
                } else {
                  // Try PulseX token images by address first
                  logoUrl = `https://tokens.app.pulsex.com/images/tokens/${address}.png`;
                }
              }
              
              // Download and store the image
              const { downloadImageAsBase64 } = await import('./services/image-storage-service.js');
              const imageData = await downloadImageAsBase64(logoUrl);
              
              const newLogo = {
                tokenAddress: address,
                logoUrl: logoUrl,
                imageData: imageData?.imageData || undefined,
                imageType: imageData?.imageType || undefined,
                symbol: tokenInfo.symbol || "",
                name: tokenInfo.name || "",
                lastUpdated: new Date().toISOString()
              };
              
              logo = await storage.saveTokenLogo(newLogo);
              console.log(`Saved DexScreener-based logo for token ${address}: ${logoUrl}`);
            } else {
              console.log(`No DexScreener pairs found for ${address}, not saving to allow future retries`);
              // No pairs found, don't save null logo to allow future retries
              logo = undefined;
            }
          } else {
            console.log(`DexScreener API error for ${address}: ${response.status}`);
            // DexScreener API error, don't save null logo to allow future retries
            logo = undefined;
          }
        } catch (err) {
          console.error(`Error fetching token data from DexScreener: ${err}`);
          
          // Don't save null logo on error to allow future retries
          logo = undefined;
        }
      }
      
      // By this point, we should always have a logo - either a real one or a fallback
      // But as a final safety check, create a default logo if somehow we still don't have one
      if (!logo) {
        // Create default fallback logo as absolute last resort
        const fallbackLogo = {
          tokenAddress: address,
          logoUrl: null,
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
            logoUrl: null,
            symbol: null,
            name: null,
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      // At this point we should definitely have a logo to return
      // If we have stored image data, convert it to a data URL
      if (logo.imageData && logo.imageType) {
        const { base64ToDataUrl } = await import('./services/image-storage-service.js');
        return res.json({
          ...logo,
          logoUrl: base64ToDataUrl(logo.imageData, logo.imageType)
        });
      }
      
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
      
      // Always require signature verification for authentication
      if (!signatureVerified) {
        if (user) {
          console.log(`Authentication attempt for existing user ${user.id} wallet ${walletAddress} without signature verification`);
          return res.status(401).json({
            message: "Signature verification required. Please sign the message to prove wallet ownership."
          });
        } else {
          console.log(`Attempt to create new user for wallet ${walletAddress} without signature verification`);
          return res.status(401).json({
            message: "Signature verification required to create a new account."
          });
        }
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
  
  // Background batch fetching endpoint for missed token prices
  app.post("/api/token-prices/background-batch", async (req, res) => {
    try {
      const { addresses, walletAddress } = req.body;
      
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ message: "addresses must be an array" });
      }
      
      console.log(`Starting background batch fetch for ${addresses.length} tokens from wallet ${walletAddress}`);
      
      // Process in background - don't wait for completion
      setImmediate(async () => {
        try {
          const results: Record<string, any> = {};
          const batchSize = 10; // Higher batch size for DexScreener
          
          for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            
            const promises = batch.map(async (address: string) => {
              try {
                const normalizedAddress = address.toLowerCase();
                
                // Fetch fresh price data
                
                // Fetch price from DexScreener
                const priceData = await getTokenPriceFromDexScreener(normalizedAddress);
                if (priceData) {
                  const tokenPrice = {
                    tokenName: 'Unknown Token',
                    tokenSymbol: 'UNKNOWN',
                    tokenDecimals: "18",
                    tokenLogo: null,
                    nativePrice: {
                      value: "1000000000000000000",
                      decimals: 18,
                      name: "PLS",
                      symbol: "PLS",
                      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                    },
                    usdPrice: priceData,
                    usdPriceFormatted: priceData.toString(),
                    exchangeName: "DexScreener",
                    exchangeAddress: "",
                    tokenAddress: normalizedAddress,
                    blockTimestamp: new Date().toISOString(),
                    verifiedContract: false,
                    securityScore: 50
                  };
                  
                  results[normalizedAddress] = tokenPrice;
                  
                  console.log(`Background fetched price for ${normalizedAddress}: $${priceData}`);
                }
              } catch (error) {
                console.error(`Error fetching background price for ${address}:`, error);
              }
            });
            
            await Promise.all(promises);
            
            // Small delay between batches to be respectful
            if (i + batchSize < addresses.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          console.log(`Background batch fetch completed for ${Object.keys(results).length} tokens`);
        } catch (error) {
          console.error('Error in background batch fetch:', error);
        }
      });
      
      // Return immediately to not block the main request
      res.json({ 
        message: "Background batch fetch started",
        addressCount: addresses.length,
        status: "processing"
      });
      
    } catch (error) {
      console.error('Error starting background batch fetch:', error);
      res.status(500).json({ 
        message: "Failed to start background batch fetch",
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

  // RPC provider health monitoring
  app.get('/api/rpc-health', async (_req, res) => {
    try {
      const health = await getProviderHealth();
      res.json(health);
    } catch (error) {
      console.error('Error getting RPC provider health:', error);
      res.status(500).json({ 
        error: 'Failed to get RPC provider health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Switch RPC provider endpoint (for debugging/admin use)
  app.post('/api/rpc-switch/:index', async (req, res) => {
    try {
      const index = parseInt(req.params.index);
      if (isNaN(index) || index < 0) {
        return res.status(400).json({ error: 'Invalid provider index' });
      }
      
      switchToProvider(index);
      const health = await getProviderHealth();
      
      res.json({ 
        message: `Switched to provider ${index}`,
        health 
      });
    } catch (error) {
      console.error('Error switching RPC provider:', error);
      res.status(500).json({ 
        error: 'Failed to switch RPC provider',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Reset failed providers endpoint
  app.post('/api/rpc-reset', async (_req, res) => {
    try {
      resetFailedProviders();
      const health = await getProviderHealth();
      
      res.json({ 
        message: 'Reset all failed providers',
        health 
      });
    } catch (error) {
      console.error('Error resetting RPC providers:', error);
      res.status(500).json({ 
        error: 'Failed to reset RPC providers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug endpoint for token price
  app.get('/api/debug/token-price/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { getTokenPriceFromContract } = await import('./services/smart-contract-price-service');
      const ethers = await import('ethers');
      
      console.log("=== Debugging Token Price ===");
      console.log("Token:", address);
      
      // Get the price data with all details
      const priceData = await getTokenPriceFromContract(address);
      
      // Also get raw pair data for both factories
      const { getRpcProvider } = await import('./services/rpc-provider');
      const provider = getRpcProvider();
      const FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address)"];
      const PAIR_ABI = [
        "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)",
        "function token0() view returns (address)",
        "function token1() view returns (address)",
      ];
      
      const WPLS = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
      const factories = [
        { address: "0x1715a3E4A142d8b698131108995174F37aEBA10D", name: "V2" },
        { address: "0x29eA7545DEf87022BAdc76323F373EA1e707C523", name: "V1" }
      ];
      
      const pairDetails = [];
      
      for (const factory of factories) {
        try {
          const factoryContract = new ethers.Contract(factory.address, FACTORY_ABI, provider);
          const pairAddress = await factoryContract.getPair(address, WPLS);
          
          if (pairAddress !== ethers.constants.AddressZero) {
            const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
            const [reserves, token0, token1] = await Promise.all([
              pairContract.getReserves(),
              pairContract.token0(),
              pairContract.token1()
            ]);
            
            const isToken0 = token0.toLowerCase() === address.toLowerCase();
            
            // Get decimals
            const ERC20_ABI = ["function decimals() view returns (uint8)"];
            const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
            const decimals = await tokenContract.decimals();
            
            // Calculate price manually
            const tokenReserve = isToken0 ? reserves[0] : reserves[1];
            const wplsReserve = isToken0 ? reserves[1] : reserves[0];
            
            const tokenAmount = parseFloat(ethers.utils.formatUnits(tokenReserve, decimals));
            const wplsAmount = parseFloat(ethers.utils.formatUnits(wplsReserve, 18));
            
            // Get WPLS price
            const wplsPrice = 0.00001554; // Current WPLS price
            
            const priceInWPLS = wplsAmount / tokenAmount;
            const priceInUSD = priceInWPLS * wplsPrice;
            const liquidity = wplsAmount * wplsPrice * 2;
            
            pairDetails.push({
              factory: factory.name,
              pairAddress,
              token0,
              token1,
              isToken0,
              reserves: {
                token: tokenAmount,
                wpls: wplsAmount
              },
              decimals,
              priceInWPLS,
              priceInUSD,
              liquidity
            });
          }
        } catch (error: any) {
          console.error(`Error checking ${factory.name}:`, error.message);
        }
      }
      
      res.json({
        token: address,
        servicePrice: priceData,
        pairDetails,
        debug: {
          wplsPrice: 0.00001554,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Debug token price error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
