import { useTokenLogo } from '@/hooks/use-token-logo';
import customTokenLogo from '../assets/100xfrenlogo.png';

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
  
  return (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center bg-secondary-200 overflow-hidden`}>
      {logoUrl ? (
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