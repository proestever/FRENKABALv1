import { useState, useEffect, useRef } from 'react';

// Logo cache to prevent excessive API calls
const logoCache: Record<string, string> = {};

interface TokenLogoProps {
  address: string;
  symbol?: string;
  fallbackLogo?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function TokenLogo({ address, symbol, fallbackLogo, size = 'md' }: TokenLogoProps) {
  // Disable all debugging logs
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
    
    // Handle special case for Frenkabal placeholder logo
    if (symbol && ['pDAI', 'frpl', 'PDAI'].includes(symbol)) {
      const frenLogo = '/assets/100xfrenlogo.png';
      logoCache[normalizedAddress] = frenLogo;
      setLogoUrl(frenLogo);
      setIsLoading(false);
      return;
    }

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
        if (data && data.logoUrl) {
          // Save to cache
          logoCache[normalizedAddress] = data.logoUrl;
          setLogoUrl(data.logoUrl);
        } else {
          // Default to the app logo if no logo found
          const defaultLogo = '/assets/100xfrenlogo.png';
          logoCache[normalizedAddress] = defaultLogo;
          setLogoUrl(defaultLogo);
        }
      } catch (error) {
        if (DEBUG_LOGGING) {
          console.error('Error fetching token logo:', error);
        }
        setError(true);
        // Default to the app logo if error
        const defaultLogo = '/assets/100xfrenlogo.png';
        logoCache[normalizedAddress] = defaultLogo;
        setLogoUrl(defaultLogo);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogo();
  }, [address, fallbackLogo]);

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
          console.warn(`Failed to load token logo for ${symbol || address}`, logoUrl);
          setError(true);
          setLogoUrl(null);
        }}
      />
    );
  }

  // Fallback
  return getFallbackLogo();
}