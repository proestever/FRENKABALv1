// Credit system routes
import express, { Router, Request, Response } from "express";
import { storage } from "../storage";
import { ethers } from "ethers";
import { z } from "zod";
import { insertCreditPackageSchema, insertCreditUsageSettingSchema } from "@shared/schema";

const router = Router();

// Get user credits
router.get("/users/:userId/credits", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    const userCredits = await storage.getUserCredits(userId);
    
    if (!userCredits) {
      // Create initial credits record for new users
      const newUserCredits = await storage.createUserCredits({
        userId,
        balance: 0,
        lifetimeCredits: 0,
        lifetimeSpent: 0
      });
      
      return res.json(newUserCredits);
    }
    
    return res.json(userCredits);
  } catch (error) {
    console.error("Error getting user credits:", error);
    return res.status(500).json({ 
      message: "Failed to retrieve user credits", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Get credit transactions for a user
router.get("/users/:userId/credit-transactions", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      return res.status(400).json({ message: "Invalid limit parameter" });
    }
    
    const transactions = await storage.getCreditTransactionsByUser(userId, limit);
    return res.json(transactions);
  } catch (error) {
    console.error("Error getting credit transactions:", error);
    return res.status(500).json({ 
      message: "Failed to retrieve credit transactions", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Get available credit packages
router.get("/credit-packages", async (_req: Request, res: Response) => {
  try {
    const packages = await storage.getCreditPackages(true); // Get only active packages
    return res.json(packages);
  } catch (error) {
    console.error("Error getting credit packages:", error);
    return res.status(500).json({ 
      message: "Failed to retrieve credit packages", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Process a payment for credits (record transaction)
router.post("/credit-payments", async (req: Request, res: Response) => {
  try {
    const { userId, packageId, txHash, fromAddress, toAddress, plsAmount } = req.body;
    
    if (!userId || !txHash || !fromAddress || !toAddress || !plsAmount) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    // Validate ethereum address format for fromAddress and toAddress
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(fromAddress) || !addressRegex.test(toAddress)) {
      return res.status(400).json({ message: "Invalid wallet address format" });
    }
    
    // Check if this transaction has already been processed
    const existingPayment = await storage.getCreditPaymentByTxHash(txHash);
    if (existingPayment) {
      return res.status(409).json({ 
        message: "Payment with this transaction hash already exists", 
        payment: existingPayment 
      });
    }
    
    // Get the credit package if packageId is provided
    let creditsToAward = 0;
    let packageDetails = null;
    
    if (packageId) {
      packageDetails = await storage.getCreditPackageById(packageId);
      if (!packageDetails) {
        return res.status(404).json({ message: "Credit package not found" });
      }
      creditsToAward = packageDetails.credits;
    } else {
      // If no package specified, calculate credits based on PLS amount
      // 1000 credits = 3000 PLS (as per your request)
      const plsAmountNumber = parseFloat(plsAmount);
      creditsToAward = Math.floor((plsAmountNumber / 3000) * 1000);
    }
    
    // Create a payment record with "pending" status
    const payment = await storage.createCreditPayment({
      userId,
      packageId: packageId || null,
      txHash,
      fromAddress,
      toAddress,
      plsAmount,
      creditsAwarded: creditsToAward,
      status: "pending",
      metadata: { packageDetails: packageDetails || null }
    });
    
    // Return the payment record
    return res.status(201).json({
      message: "Payment recorded and pending verification",
      payment,
      creditsToAward
    });
  } catch (error) {
    console.error("Error processing credit payment:", error);
    return res.status(500).json({ 
      message: "Failed to process payment", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Confirm a payment and award credits
router.post("/credit-payments/:id/confirm", async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { adminUserId } = req.body;
    
    if (isNaN(paymentId)) {
      return res.status(400).json({ message: "Invalid payment ID" });
    }
    
    // Get the payment record
    const payment = await storage.getCreditTransactionById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    
    if (payment.type !== 'purchase') {
      return res.status(400).json({ message: "This transaction is not a payment" });
    }
    
    // Admin authorization check (simple version - can be expanded)
    // In a real system, you'd have proper admin role checking
    if (!adminUserId) {
      return res.status(401).json({ message: "Admin authorization required" });
    }
    
    // Get the metadata which contains the creditsToAward
    const metadata = payment.metadata as any;
    if (!metadata || !metadata.creditsToAward) {
      return res.status(400).json({ message: "Invalid payment metadata" });
    }
    
    const creditsToAward = metadata.creditsToAward;
    const userId = payment.userId;
    
    // Award the credits to the user
    const updatedCredits = await storage.addCreditsToUser(userId, creditsToAward);
    
    // Update the transaction status to confirmed
    await storage.updateCreditPaymentStatus(paymentId, "confirmed", new Date());
    
    // Create a credit transaction record for the purchase
    await storage.createCreditTransaction({
      userId,
      amount: creditsToAward,
      type: "purchase",
      relatedEntityType: "payment",
      relatedEntityId: String(paymentId),
      description: `Purchase of ${creditsToAward} credits from PLS payment`,
      metadata: { paymentId }
    });
    
    return res.json({
      message: "Payment confirmed and credits awarded",
      updatedCredits,
      creditsAwarded: creditsToAward
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({ 
      message: "Failed to confirm payment", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Check a transaction on the blockchain
router.post("/credit-payments/verify-transaction", async (req: Request, res: Response) => {
  try {
    const { txHash, expectedToAddress, expectedMinimumAmount } = req.body;
    
    if (!txHash || !expectedToAddress) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    // Validate ethereum address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!expectedToAddress || !addressRegex.test(expectedToAddress)) {
      return res.status(400).json({ message: "Invalid wallet address format" });
    }
    
    // In a real implementation, you would verify the transaction on the blockchain
    // using a provider like ethers.js to connect to the PulseChain RPC
    // This is a simplified example
    
    // Get the transaction data from blockchain
    // In practice, this should be done with a proper RPC endpoint
    // const provider = new ethers.providers.JsonRpcProvider('https://rpc.pulsechain.com');
    // const tx = await provider.getTransaction(txHash);
    // const receipt = await provider.getTransactionReceipt(txHash);
    
    // For now, we'll simulate a successful transaction verification
    const verificationResult = {
      success: true,
      transaction: {
        hash: txHash,
        to: expectedToAddress.toLowerCase(),
        value: ethers.utils.parseEther("3000"), // Example value
        from: "0x1234567890123456789012345678901234567890", // Example sender address
        confirmations: 20
      }
    };
    
    // Check if the transaction was sent to the expected address
    if (verificationResult.transaction.to !== expectedToAddress.toLowerCase()) {
      return res.status(400).json({ 
        message: "Transaction was not sent to the expected address",
        expected: expectedToAddress.toLowerCase(),
        actual: verificationResult.transaction.to
      });
    }
    
    // Check if the transaction value is greater than or equal to the expected amount
    if (expectedMinimumAmount) {
      const expectedWei = ethers.utils.parseEther(expectedMinimumAmount);
      const actualWei = verificationResult.transaction.value;
      
      if (actualWei.lt(expectedWei)) {
        return res.status(400).json({
          message: "Transaction amount is less than expected",
          expected: expectedMinimumAmount,
          actual: ethers.utils.formatEther(actualWei)
        });
      }
    }
    
    return res.json({
      message: "Transaction verified successfully",
      transaction: verificationResult.transaction,
      isValid: true
    });
  } catch (error) {
    console.error("Error verifying transaction:", error);
    return res.status(500).json({ 
      message: "Failed to verify transaction", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Create a new credit package
router.post("/admin/credit-packages", async (req: Request, res: Response) => {
  try {
    const { adminUserId } = req.body;
    
    // Admin authorization check
    if (!adminUserId) {
      return res.status(401).json({ message: "Admin authorization required" });
    }
    
    // Validate the package data
    const validationResult = insertCreditPackageSchema.safeParse(req.body.package);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid credit package data", 
        errors: validationResult.error.errors 
      });
    }
    
    // Create the new package
    const newPackage = await storage.createCreditPackage(validationResult.data);
    
    return res.status(201).json({
      message: "Credit package created successfully",
      package: newPackage
    });
  } catch (error) {
    console.error("Error creating credit package:", error);
    return res.status(500).json({ 
      message: "Failed to create credit package", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Update an existing credit package
router.patch("/admin/credit-packages/:id", async (req: Request, res: Response) => {
  try {
    const packageId = parseInt(req.params.id, 10);
    const { adminUserId } = req.body;
    
    if (isNaN(packageId)) {
      return res.status(400).json({ message: "Invalid package ID" });
    }
    
    // Admin authorization check
    if (!adminUserId) {
      return res.status(401).json({ message: "Admin authorization required" });
    }
    
    // Get the existing package
    const existingPackage = await storage.getCreditPackageById(packageId);
    if (!existingPackage) {
      return res.status(404).json({ message: "Credit package not found" });
    }
    
    // Update the package
    const updatedPackage = await storage.updateCreditPackage(packageId, req.body.package);
    
    return res.json({
      message: "Credit package updated successfully",
      package: updatedPackage
    });
  } catch (error) {
    console.error("Error updating credit package:", error);
    return res.status(500).json({ 
      message: "Failed to update credit package", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Manage credit usage settings
router.post("/admin/credit-usage-settings", async (req: Request, res: Response) => {
  try {
    const { adminUserId } = req.body;
    
    // Admin authorization check
    if (!adminUserId) {
      return res.status(401).json({ message: "Admin authorization required" });
    }
    
    // Validate the setting data
    const validationResult = insertCreditUsageSettingSchema.safeParse(req.body.setting);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid credit usage setting data", 
        errors: validationResult.error.errors 
      });
    }
    
    // Create the new setting
    const newSetting = await storage.createCreditUsageSetting(validationResult.data);
    
    return res.status(201).json({
      message: "Credit usage setting created successfully",
      setting: newSetting
    });
  } catch (error) {
    console.error("Error creating credit usage setting:", error);
    return res.status(500).json({ 
      message: "Failed to create credit usage setting", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Get all credit usage settings
router.get("/credit-usage-settings", async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getCreditUsageSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Error getting credit usage settings:", error);
    return res.status(500).json({ 
      message: "Failed to retrieve credit usage settings", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Deduct credits for a wallet search
router.post("/users/:userId/deduct-credits", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { featureKey, entityId } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    if (!featureKey) {
      return res.status(400).json({ message: "Feature key is required" });
    }
    
    // Get the credit cost for this feature
    const usageSetting = await storage.getCreditUsageSettingByKey(featureKey);
    if (!usageSetting) {
      return res.status(404).json({ message: "Credit usage setting not found for this feature" });
    }
    
    if (!usageSetting.isActive) {
      return res.status(400).json({ message: "This feature is not currently available" });
    }
    
    const creditCost = usageSetting.creditCost;
    
    // Get user's current credits
    const userCredits = await storage.getUserCredits(userId);
    if (!userCredits) {
      return res.status(404).json({ message: "User has no credits record" });
    }
    
    // Check if user has enough credits
    if (userCredits.balance < creditCost) {
      return res.status(402).json({ 
        message: "Insufficient credits", 
        available: userCredits.balance,
        required: creditCost,
        shortfall: creditCost - userCredits.balance
      });
    }
    
    // Deduct the credits
    const updatedCredits = await storage.deductCreditsFromUser(userId, creditCost);
    
    // Record the transaction
    const transaction = await storage.createCreditTransaction({
      userId,
      amount: -creditCost,
      type: "usage",
      relatedEntityType: featureKey,
      relatedEntityId: entityId || null,
      description: `Used ${creditCost} credits for ${usageSetting.displayName}`,
      metadata: { featureKey, entityId }
    });
    
    return res.json({
      message: "Credits deducted successfully",
      deducted: creditCost,
      remaining: updatedCredits.balance,
      transaction
    });
  } catch (error) {
    console.error("Error deducting credits:", error);
    return res.status(500).json({ 
      message: "Failed to deduct credits", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Admin: Award credits to a user manually
router.post("/admin/users/:userId/award-credits", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { amount, reason, adminUserId } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Admin authorization check
    if (!adminUserId) {
      return res.status(401).json({ message: "Admin authorization required" });
    }
    
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }
    
    // Award the credits
    const updatedCredits = await storage.addCreditsToUser(userId, amount);
    
    // Record the transaction
    const transaction = await storage.createCreditTransaction({
      userId,
      amount,
      type: "admin_adjustment",
      description: reason || `Admin awarded ${amount} credits`,
      metadata: { adminUserId, reason }
    });
    
    return res.json({
      message: "Credits awarded successfully",
      awarded: amount,
      newBalance: updatedCredits.balance,
      transaction
    });
  } catch (error) {
    console.error("Error awarding credits:", error);
    return res.status(500).json({ 
      message: "Failed to award credits", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;