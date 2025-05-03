import { useTokenLogo } from '@/hooks/use-token-logo';
import customTokenLogo from '../assets/100xfrenlogo.png';
import plsLogo from '../assets/pls-logo.png';

interface TokenLogoProps {
  address: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  fallbackLogo?: string;
  rounded?: boolean; // Option to control if the logo container is rounded
}

/**
 * Component for displaying token logos with fallback
 */
export function TokenLogo({ address, symbol, size = 'md', fallbackLogo, rounded = true }: TokenLogoProps) {
  const logoUrl = useTokenLogo(address, fallbackLogo);
  
  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };
  
  // Check if this is the native PLS token
  const isPLS = symbol.toLowerCase() === 'pls' || 
               address.toLowerCase() === '0x5616458eb2bac88dd60a4b08f815f37335215f9b' || 
               address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  
  return (
    <div className={`${sizeClasses[size]} ${rounded ? 'rounded-full' : ''} flex items-center justify-center bg-secondary/80 overflow-hidden border border-border/40 shadow-sm`}>
      {isPLS ? (
        // Always use our custom PLS logo for the native token
        <img 
          src={plsLogo} 
          alt="PLS" 
          className="w-full h-full object-cover p-1"
          loading="lazy"
        />
      ) : logoUrl ? (
        // For other tokens, use the logo from API with fallback
        <img 
          src={logoUrl} 
          alt={symbol} 
          className="w-full h-full object-cover p-1"
          onError={(e) => {
            (e.target as HTMLImageElement).src = customTokenLogo;
          }}
          loading="lazy"
        />
      ) : (
        // Fallback for tokens without a logo - use object-contain only for this one
        <img 
          src={customTokenLogo} 
          alt={symbol} 
          className="w-full h-full object-contain p-1"
          loading="lazy"
        />
      )}
    </div>
  );
}