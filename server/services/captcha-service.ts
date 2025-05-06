/**
 * CAPTCHA Service for managing CAPTCHA requirements and validation
 * 
 * This service tracks API usage per IP address and requires CAPTCHA verification
 * after a configurable number of requests within a time period.
 */

import axios from 'axios';
import { Request } from 'express';

/**
 * Helper function to get client IP from request
 * @param req Express request object
 * @returns Client IP address
 */
export function getClientIp(req: Request): string {
  // Try to get IP from various headers (for proxied requests)
  const xForwardedFor = req.headers['x-forwarded-for'];
  const ip = typeof xForwardedFor === 'string' 
    ? xForwardedFor.split(',')[0].trim()
    : req.socket.remoteAddress || '0.0.0.0';
  
  return ip;
}

// Cache to store IP request counts with timestamps
interface IpRequestData {
  count: number;
  firstRequestTime: number;
  lastRequestTime: number;
  captchaVerifiedAt?: number;
}

// In-memory store for tracking IP request counts
const ipRequestCache: Record<string, IpRequestData> = {};

// Cloudflare Turnstile configuration
const siteKey = process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '';
const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '';

// Configuration for CAPTCHA thresholds
const CAPTCHA_CONFIG = {
  // Number of requests in a period before CAPTCHA is required
  REQUEST_THRESHOLD: 5, 
  
  // Time window for counting requests in milliseconds (5 minutes)
  TIME_WINDOW_MS: 5 * 60 * 1000,
  
  // How long a successful CAPTCHA verification is valid for (10 minutes)
  CAPTCHA_VALID_DURATION_MS: 10 * 60 * 1000,
};

/**
 * Track a request from an IP address
 * @param ip The client IP address
 * @returns The updated request count for this IP
 */
export function trackRequest(ip: string): number {
  const now = Date.now();
  
  // Initialize or update the IP data
  if (!ipRequestCache[ip]) {
    ipRequestCache[ip] = {
      count: 1,
      firstRequestTime: now,
      lastRequestTime: now
    };
    return 1;
  }
  
  const ipData = ipRequestCache[ip];
  
  // If outside the time window, reset the counter
  if (now - ipData.firstRequestTime > CAPTCHA_CONFIG.TIME_WINDOW_MS) {
    ipData.count = 1;
    ipData.firstRequestTime = now;
  } else {
    ipData.count++;
  }
  
  ipData.lastRequestTime = now;
  
  return ipData.count;
}

/**
 * Check if CAPTCHA verification is required for this IP
 * @param ip The client IP address
 * @returns true if CAPTCHA verification is required, false otherwise
 */
export function shouldRequireCaptcha(ip: string): boolean {
  // If no IP tracking data, no CAPTCHA needed yet
  if (!ipRequestCache[ip]) {
    return false;
  }
  
  const ipData = ipRequestCache[ip];
  const now = Date.now();
  
  // If CAPTCHA was recently verified, don't require it again
  if (ipData.captchaVerifiedAt && 
      now - ipData.captchaVerifiedAt < CAPTCHA_CONFIG.CAPTCHA_VALID_DURATION_MS) {
    return false;
  }
  
  // Require CAPTCHA if request count exceeds threshold within time window
  return ipData.count >= CAPTCHA_CONFIG.REQUEST_THRESHOLD && 
         now - ipData.firstRequestTime <= CAPTCHA_CONFIG.TIME_WINDOW_MS;
}

/**
 * Reset the request count for an IP after successful CAPTCHA verification
 * @param ip The client IP address
 */
export function recordCaptchaSuccess(ip: string): void {
  if (!ipRequestCache[ip]) {
    ipRequestCache[ip] = {
      count: 0,
      firstRequestTime: Date.now(),
      lastRequestTime: Date.now(),
      captchaVerifiedAt: Date.now()
    };
    return;
  }
  
  // Record CAPTCHA verification time
  ipRequestCache[ip].captchaVerifiedAt = Date.now();
  // Reset request count
  ipRequestCache[ip].count = 0;
}

/**
 * Verify a CAPTCHA response token with Cloudflare Turnstile
 * @param token The CAPTCHA response token from the client
 * @param ip The client IP address
 * @returns Promise resolving to verification success or failure
 */
export async function verifyCaptcha(token: string, ip: string): Promise<boolean> {
  // If no secret key is configured, consider verification successful in development
  if (!secretKey) {
    console.warn('CAPTCHA verification skipped: No secret key configured');
    return true;
  }
  
  try {
    // Prepare verification data
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    formData.append('remoteip', ip);
    
    // Send verification request to Cloudflare Turnstile
    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Return verification result
    const result = response.data;
    if (!result.success) {
      console.warn('CAPTCHA verification failed:', result['error-codes'] || 'Unknown error');
      return false;
    }
    
    console.log('CAPTCHA verified successfully for IP:', ip);
    return true;
  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    return false;
  }
}

/**
 * Helper function to get the Cloudflare Turnstile site key
 * @returns The Cloudflare Turnstile site key
 */
export function getCaptchaSiteKey(): string {
  return siteKey;
}

/**
 * Periodically clean up the IP request cache to prevent memory leaks
 * This function removes entries that haven't been accessed in a while
 */
function cleanupIpRequestCache() {
  const now = Date.now();
  const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
  
  for (const ip in ipRequestCache) {
    if (now - ipRequestCache[ip].lastRequestTime > MAX_AGE_MS) {
      delete ipRequestCache[ip];
    }
  }
}

// Run cleanup every hour
setInterval(cleanupIpRequestCache, 60 * 60 * 1000);