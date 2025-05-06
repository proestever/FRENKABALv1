import fetch from 'node-fetch';

// Interface for CAPTCHA verification response
interface CaptchaVerificationResponse {
  success: boolean;
  error_codes?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

// Store user search counts by IP address
interface SearchCountStore {
  [ipAddress: string]: {
    count: number;
    lastReset: number;
  };
}

// Constants
const SEARCH_THRESHOLD = 10; // Number of searches before CAPTCHA is required
const RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Store to track search counts
const searchCounts: SearchCountStore = {};

/**
 * Get the real IP address from request headers
 */
export function getClientIp(req: any): string {
  // Check for Cloudflare headers first
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  }

  // Check for X-Forwarded-For
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, use the first one
    const ips = Array.isArray(forwardedFor) 
      ? forwardedFor[0] 
      : forwardedFor;
    
    return ips.split(',')[0].trim();
  }

  // Fallback to direct connection
  return req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         req.ip || 
         '127.0.0.1';
}

/**
 * Track search counts and determine if CAPTCHA is required
 */
export function shouldRequireCaptcha(ipAddress: string): boolean {
  // Initialize entry if it doesn't exist
  if (!searchCounts[ipAddress]) {
    searchCounts[ipAddress] = {
      count: 0,
      lastReset: Date.now()
    };
  }

  // Check if we need to reset the counter (24 hours passed)
  const now = Date.now();
  if (now - searchCounts[ipAddress].lastReset > RESET_INTERVAL) {
    searchCounts[ipAddress] = {
      count: 1, // Already counting this search
      lastReset: now
    };
    return false;
  }

  // Increment counter
  searchCounts[ipAddress].count++;

  // Check if count exceeds threshold
  return searchCounts[ipAddress].count > SEARCH_THRESHOLD;
}

/**
 * Record a successful CAPTCHA verification and reset counter
 */
export function recordCaptchaSuccess(ipAddress: string): void {
  // Reset counter after successful CAPTCHA
  searchCounts[ipAddress] = {
    count: 0,
    lastReset: Date.now()
  };
}

/**
 * Verify Cloudflare Turnstile CAPTCHA response
 */
export async function verifyCaptcha(
  response: string,
  remoteip: string,
  secret: string
): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', response);
    formData.append('remoteip', remoteip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const data = await result.json() as CaptchaVerificationResponse;
    return data.success === true;
  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    return false;
  }
}