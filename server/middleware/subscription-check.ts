import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * Middleware to check if a user has an active subscription
 * - Blocks access to premium features if no active subscription is found
 * - Only applies to authenticated users
 * - Public routes and endpoints bypass this check
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip subscription check for unauthenticated users (they'll be handled by the endpoints)
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
      return next();
    }
    
    const userId = req.user.id;
    
    // Check if user has an active subscription
    const subscription = await storage.getUserActiveSubscription(userId);
    
    // Check if subscription exists and is still valid
    const hasActiveSubscription = subscription && 
      subscription.status === 'confirmed' && 
      new Date(subscription.endDate) > new Date();
    
    // Add subscription status to request object for use in route handlers
    req.hasActiveSubscription = hasActiveSubscription;
    
    // Continue to next middleware/route handler
    next();
  } catch (error) {
    console.error('Error checking subscription status:', error);
    next();
  }
}

/**
 * Middleware to restrict access to premium features
 * - Requires an active subscription to access
 * - Will return 402 (Payment Required) if no subscription is found
 */
export function restrictToPaidSubscribers(req: Request, res: Response, next: NextFunction) {
  // If user is not authenticated, return 401
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this feature'
    });
  }
  
  // If user doesn't have an active subscription, return 402
  if (!req.hasActiveSubscription) {
    return res.status(402).json({
      error: 'Subscription required',
      message: 'You need an active subscription to access this feature',
      subscriptionRequired: true
    });
  }
  
  // User has an active subscription, proceed
  next();
}

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      hasActiveSubscription?: boolean;
    }
  }
}