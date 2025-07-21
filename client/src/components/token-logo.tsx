import { useState, useEffect, useRef } from 'react';

// Logo cache to prevent excessive API calls
const logoCache: Record<string, string> = {};

interface TokenLogoProps {
  address: string;
  symbol?: string;
  fallbackLogo?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  logo?: string; // Direct logo URL from token data
}

export function TokenLogo({ address, symbol, fallbackLogo, size = 'md', logo }: TokenLogoProps) {
  // Disable debugging logs
  const DEBUG_LOGGING = false;
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // Use ref to track if we've already attempted to fetch this logo
  const attemptedFetch = useRef(false);

  // Get the size class based on the size prop
  const sizeClass = 
    size === 'xs' ? 'w-4 h-4' :
    size === 'sm' ? 'w-6 h-6' : 
    size === 'lg' ? 'w-10 h-10' : 
    'w-8 h-8'; // medium size default

  // Get token logo, using cache when possible
  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      setError(true);
      return;
    }
    
    // Normalize address for consistency
    const normalizedAddress = address.toLowerCase();
    
    // Only use the logo prop if it's a valid URL (not a placeholder)
    if (logo && !logo.includes('100xfrenlogo')) {
      setLogoUrl(logo);
      setIsLoading(false);
      // Also cache it for future use
      logoCache[normalizedAddress] = logo;
      return;
    }
    
    // If we have a direct fallback logo, use it immediately
    if (fallbackLogo) {
      setLogoUrl(fallbackLogo);
      setIsLoading(false);
      return;
    }
    
    // Check cache first
    if (logoCache[normalizedAddress]) {
      setLogoUrl(logoCache[normalizedAddress]);
      setIsLoading(false);
      return;
    }

    // Special cases that don't need API calls
    // Handle special case for native PLS token - check both symbol and address format
    if (normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || 
        symbol?.toUpperCase() === 'PLS' || 
        symbol === 'PulseChain') {
      const plsLogo = '/assets/pls-logo-trimmed.png';
      logoCache[normalizedAddress] = plsLogo;
      setLogoUrl(plsLogo);
      setIsLoading(false);
      return;
    }
    
    // Removed special case - all tokens now use standard logo fetching

    // Don't attempt to fetch the same logo multiple times in one session
    if (attemptedFetch.current) {
      return;
    }
    
    // Set flag to indicate we've tried to fetch this logo
    attemptedFetch.current = true;

    // Try to fetch the logo from our API
    const fetchLogo = async () => {
      try {
        setIsLoading(true);
        setError(false);

        const response = await fetch(`/api/token-logo/${normalizedAddress}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch token logo');
        }
        
        const data = await response.json();
        if (DEBUG_LOGGING) {
          console.log(`Token logo API response for ${normalizedAddress}:`, data);
        }
        if (data && data.logoUrl) {
          if (DEBUG_LOGGING) {
            console.log(`Setting logo URL for ${normalizedAddress}: ${data.logoUrl}`);
          }
          // Save to cache
          logoCache[normalizedAddress] = data.logoUrl;
          setLogoUrl(data.logoUrl);
        } else {
          // No logo found, will use initials instead
          if (DEBUG_LOGGING) {
            console.log(`No logo found for ${normalizedAddress}, will use initials`);
          }
          logoCache[normalizedAddress] = null;
          setLogoUrl(null);
        }
      } catch (error) {
        if (DEBUG_LOGGING) {
          console.error('Error fetching token logo:', error);
        }
        setError(true);
        // On error, use initials instead
        logoCache[normalizedAddress] = null;
        setLogoUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogo();
  }, [address, fallbackLogo, logo]);

  // Generate the fallback logo/text
  const getFallbackLogo = () => {
    // Special case for PLS token
    if (symbol?.toUpperCase() === 'PLS' || 
        symbol === 'PulseChain' || 
        address?.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return (
        <img 
          src="/assets/pls-logo-trimmed.png" 
          alt="PLS" 
          className={`${sizeClass} rounded-full object-cover border border-white/10`}
        />
      );
    }

    // Use the symbol if available
    if (symbol) {
      // Get the first 2 characters of the symbol
      const text = symbol.slice(0, 2).toUpperCase();
      
      return (
        <div className={`${sizeClass} rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold`}>
          {text}
        </div>
      );
    }
    
    // If no symbol, use address
    if (address) {
      // Get the first 2 characters of the address (after 0x)
      const text = address.slice(2, 4).toUpperCase();
      
      return (
        <div className={`${sizeClass} rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white font-bold`}>
          {text}
        </div>
      );
    }
    
    // Ultimate fallback
    return (
      <div className={`${sizeClass} rounded-full bg-gray-700 flex items-center justify-center text-white font-bold`}>
        ?
      </div>
    );
  };

  // When loading
  if (isLoading) {
    return (
      <div className={`${sizeClass} rounded-full bg-secondary/30 animate-pulse`}></div>
    );
  }

  // If we have a logo URL
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={symbol || 'Token logo'} 
        className={`${sizeClass} rounded-full object-cover border border-white/10`}
        onError={(e) => {
          // Prevent infinite error loops
          e.currentTarget.onerror = null;
          if (DEBUG_LOGGING) {
            console.log(`Image load error for ${logoUrl} (address: ${address}), falling back to generated logo`);
          }
          setError(true);
          setLogoUrl(null);
        }}
      />
    );
  }

  // Fallback
  return getFallbackLogo();
}