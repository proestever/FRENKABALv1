import { useTokenLogo } from '@/hooks/use-token-logo';
import customTokenLogo from '../assets/100xfrenlogo.png';
import plsLogo from '../assets/pls-logo-optimized.png'; // Use optimized PLS logo
import { memo, useMemo } from 'react';

// Map of common token symbols to their local logos
// This prevents unnecessary API calls for common tokens
const COMMON_TOKEN_LOGOS: Record<string, string> = {
  'pls': plsLogo,
  'fren': customTokenLogo,
  'frens': customTokenLogo,
  'kabal': customTokenLogo,
  '100xfren': customTokenLogo,
};

// PLS token addresses (both mainnet and testnet)
const PLS_ADDRESSES = [
  '0x5616458eb2bac88dd60a4b08f815f37335215f9b',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
];

interface TokenLogoProps {
  address: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  fallbackLogo?: string;
  rounded?: boolean; // Option to control if the logo container is rounded
}

/**
 * Component for displaying token logos with fallback
 * Memoized to prevent unnecessary re-renders and API calls
 */
export const TokenLogo = memo(function TokenLogo({ 
  address, 
  symbol, 
  size = 'md', 
  fallbackLogo, 
  rounded = true 
}: TokenLogoProps) {
  // Check if this is a common token we have a local logo for
  const normalizedSymbol = symbol.toLowerCase();
  const normalizedAddress = address.toLowerCase();
  
  // Determine if we should use a local logo or fetch from API
  const shouldUseLocalLogo = useMemo(() => {
    return normalizedSymbol in COMMON_TOKEN_LOGOS || PLS_ADDRESSES.includes(normalizedAddress);
  }, [normalizedSymbol, normalizedAddress]);
  
  // Only fetch from API if not a common token
  const logoUrl = shouldUseLocalLogo 
    ? null 
    : useTokenLogo(address, fallbackLogo);
  
  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };
  
  // Get the appropriate logo source
  const logoSrc = useMemo(() => {
    // For PLS token
    if (normalizedSymbol === 'pls' || PLS_ADDRESSES.includes(normalizedAddress)) {
      return plsLogo;
    }
    
    // For other common tokens
    if (normalizedSymbol in COMMON_TOKEN_LOGOS) {
      return COMMON_TOKEN_LOGOS[normalizedSymbol];
    }
    
    // For tokens with API logos
    if (logoUrl) {
      return logoUrl;
    }
    
    // Fallback to default
    return customTokenLogo;
  }, [normalizedSymbol, normalizedAddress, logoUrl]);
  
  return (
    <div className={`${sizeClasses[size]} ${rounded ? 'rounded-full' : ''} flex items-center justify-center bg-secondary/80 overflow-hidden border border-border/40 shadow-sm`}>
      <img 
        src={logoSrc} 
        alt={symbol} 
        className="w-full h-full object-contain p-1"
        onError={(e) => {
          // On error, fallback to custom token logo
          (e.target as HTMLImageElement).src = customTokenLogo;
        }}
        loading="eager" // Load eagerly for visible tokens
        decoding="async" // Use async decoding for performance
      />
    </div>
  );
});