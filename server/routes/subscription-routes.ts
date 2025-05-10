import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { ethers } from "ethers";
import { insertSubscriptionPaymentSchema } from "@shared/schema";

const router = Router();

// Get all subscription packages
router.get("/subscription-packages", async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== "false";
    const packages = await storage.getSubscriptionPackages(activeOnly);
    res.json(packages);
  } catch (error) {
    console.error("Error fetching subscription packages:", error);
    res.status(500).json({ error: "Failed to fetch subscription packages" });
  }
});

// Get a specific subscription package
router.get("/subscription-packages/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid package ID" });
    }
    
    const pkg = await storage.getSubscriptionPackageById(id);
    if (!pkg) {
      return res.status(404).json({ error: "Subscription package not found" });
    }
    
    res.json(pkg);
  } catch (error) {
    console.error(`Error fetching subscription package ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to fetch subscription package" });
  }
});

// Get user's active subscription
router.get("/users/:userId/subscription", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    
    // Check if user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get user's active subscription
    const subscription = await storage.getUserActiveSubscription(userId);
    
    // If subscription exists and has a package ID, fetch the package details
    if (subscription && subscription.packageId) {
      const pkg = await storage.getSubscriptionPackageById(subscription.packageId);
      if (pkg) {
        return res.json({
          ...subscription,
          package: pkg
        });
      }
    }
    
    // Return just the subscription or null if none exists
    res.json(subscription || null);
  } catch (error) {
    console.error(`Error fetching subscription for user ${req.params.userId}:`, error);
    res.status(500).json({ error: "Failed to fetch user subscription" });
  }
});

// Get user's subscription history
router.get("/users/:userId/subscription-history", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    
    // Check if user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get user's subscription history
    const history = await storage.getUserSubscriptionHistory(userId);
    
    res.json(history);
  } catch (error) {
    console.error(`Error fetching subscription history for user ${req.params.userId}:`, error);
    res.status(500).json({ error: "Failed to fetch subscription history" });
  }
});

// Process a new subscription payment
router.post("/subscription-payments", async (req, res) => {
  try {
    // Validate request body
    const paymentData = insertSubscriptionPaymentSchema.parse(req.body);
    
    // Check if user exists
    const user = await storage.getUser(paymentData.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Check if package exists (if packageId is provided)
    if (paymentData.packageId) {
      const pkg = await storage.getSubscriptionPackageById(paymentData.packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Subscription package not found" });
      }
    }
    
    // Verify that txHash is a valid transaction hash
    if (!ethers.utils.isHexString(paymentData.txHash) || paymentData.txHash.length !== 66) {
      return res.status(400).json({ error: "Invalid transaction hash" });
    }
    
    // Check if this transaction hash has already been used
    const existingPayment = await storage.getSubscriptionPaymentByTxHash(paymentData.txHash);
    if (existingPayment) {
      return res.status(409).json({ error: "This transaction has already been processed" });
    }
    
    // Set initial status to pending
    const payment = await storage.createSubscriptionPayment({
      ...paymentData,
      status: "pending"
    });
    
    // Return the created payment
    res.status(201).json(payment);
    
    // In a real implementation, you would have a separate service that verifies the transaction
    // and updates the payment status and user subscription status
  } catch (error) {
    console.error("Error processing subscription payment:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid payment data", details: error.format() });
    }
    
    res.status(500).json({ error: "Failed to process subscription payment" });
  }
});

// Update subscription payment status (admin endpoint)
router.patch("/subscription-payments/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid payment ID" });
    }
    
    // Validate request body
    const { status } = req.body;
    if (!status || !["pending", "confirmed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    // Update payment status
    const payment = await storage.updateSubscriptionPaymentStatus(
      id, 
      status, 
      status === "confirmed" ? new Date() : undefined
    );
    
    // If the payment is confirmed, update the user's subscription info
    if (status === "confirmed" && payment.packageId) {
      const pkg = await storage.getSubscriptionPackageById(payment.packageId);
      if (pkg) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + pkg.durationDays);
        
        const updatedPayment = await storage.updateSubscriptionPaymentStatus(
          payment.id, 
          status, 
          new Date()
        );
        
        // Update user's subscription status
        await storage.updateUserSubscription(payment.userId, {
          subscriptionStatus: "active",
          subscriptionTier: pkg.name,
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate,
          hasPaidSubscription: true
        });
        
        return res.json(updatedPayment);
      }
    }
    
    res.json(payment);
  } catch (error) {
    console.error(`Error updating subscription payment status ${req.params.id}:`, error);
    res.status(500).json({ error: "Failed to update payment status" });
  }
});

export default router;