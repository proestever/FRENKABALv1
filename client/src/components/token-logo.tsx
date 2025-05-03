import { useTokenLogo } from '@/hooks/use-token-logo';
import customTokenLogo from '../assets/100xfrenlogo.png';
import plsLogo from '../assets/pls-logo.png';

interface TokenLogoProps {
  address: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  fallbackLogo?: string;
}

/**
 * Component for displaying token logos with fallback
 */
export function TokenLogo({ address, symbol, size = 'md', fallbackLogo }: TokenLogoProps) {
  const logoUrl = useTokenLogo(address, fallbackLogo);
  const initials = symbol.substring(0, 2).toUpperCase();
  
  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };
  
  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };
  
  // Check if this is the native PLS token
  const isPLS = symbol.toLowerCase() === 'pls' || 
               address.toLowerCase() === '0x5616458eb2bac88dd60a4b08f815f37335215f9b' || 
               address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  
  return (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center bg-secondary/80 overflow-hidden border border-border/40 shadow-sm`}>
      {isPLS ? (
        // Always use our custom PLS logo for the native token
        <img 
          src={plsLogo} 
          alt="PLS" 
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : logoUrl ? (
        // For other tokens, use the logo from API with fallback
        <img 
          src={logoUrl} 
          alt={symbol} 
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = customTokenLogo;
          }}
          loading="lazy"
        />
      ) : (
        // Fallback for tokens without a logo
        <img 
          src={customTokenLogo} 
          alt={symbol} 
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  );
}