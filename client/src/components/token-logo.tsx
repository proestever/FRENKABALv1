import { useState, useEffect } from 'react';

interface TokenLogoProps {
  address: string;
  symbol?: string;
  fallbackLogo?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TokenLogo({ address, symbol, fallbackLogo, size = 'md' }: TokenLogoProps) {
  // Only log debugging information when explicitly enabled
  const DEBUG_LOGGING = false;
  if (DEBUG_LOGGING) {
    console.log("TokenLogo props:", { address, symbol, fallbackLogo });
  }
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Get the size class based on the size prop
  const sizeClass = 
    size === 'sm' ? 'w-6 h-6' : 
    size === 'lg' ? 'w-10 h-10' : 
    'w-8 h-8'; // medium size default

  // Get fallback logo from local storage/cache if possible
  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      setError(true);
      return;
    }

    // If we have a direct fallback logo, use it immediately
    if (fallbackLogo) {
      setLogoUrl(fallbackLogo);
      setIsLoading(false);
      return;
    }

    // Try to fetch the logo from our API
    const fetchLogo = async () => {
      try {
        // Normalize address
        const normalizedAddress = address.toLowerCase();
        setIsLoading(true);
        setError(false);

        // Handle special case for native PLS token
        if (normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || symbol === 'PLS') {
          if (DEBUG_LOGGING) {
            console.log('Using native PLS token logo for:', address, symbol);
          }
          setLogoUrl('/pls-logo.png');
          setIsLoading(false);
          return;
        }
        
        // Handle special case for Frenkabal placeholder logo
        if (symbol && ['pDAI', 'frpl', 'PDAI'].includes(symbol)) {
          if (DEBUG_LOGGING) {
            console.log('Using Frenkabal logo for:', address, symbol);
          }
          setLogoUrl('/assets/100xfrenlogo.png');
          setIsLoading(false);
          return;
        }
        
        // Handle token logos directly provided by the server
        if (fallbackLogo && (fallbackLogo.startsWith('/assets/') || fallbackLogo.startsWith('https://') || fallbackLogo.startsWith('http://'))) {
          if (DEBUG_LOGGING) {
            console.log('Using provided fallback logo:', fallbackLogo);
          }
          setLogoUrl(fallbackLogo);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/token-logo/${normalizedAddress}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch token logo');
        }
        
        const data = await response.json();
        if (data && data.logoUrl) {
          setLogoUrl(data.logoUrl);
        } else {
          // Default to the app logo if no logo found
          setLogoUrl('/assets/100xfrenlogo.png');
        }
      } catch (error) {
        console.error('Error fetching token logo:', error);
        setError(true);
        // Default to the app logo if error
        setLogoUrl('/assets/100xfrenlogo.png');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogo();
  }, [address, fallbackLogo]);

  // Generate the fallback logo/text
  const getFallbackLogo = () => {
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