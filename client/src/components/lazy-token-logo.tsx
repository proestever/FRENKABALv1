import { useLazyImage } from '@/hooks/use-lazy-image';
import { cn } from '@/lib/utils';

interface LazyTokenLogoProps {
  address: string;
  symbol?: string;
  fallbackLogo?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12'
};

export function LazyTokenLogo({ 
  address, 
  symbol, 
  fallbackLogo = '/assets/100xfrenlogo.png',
  size = 'md',
  className 
}: LazyTokenLogoProps) {
  const logoSrc = `/api/token-logo/${address}`;
  const { imgRef, imageSrc, handleError, isLoading } = useLazyImage({
    src: logoSrc,
    fallbackSrc: fallbackLogo
  });
  
  return (
    <div className={cn(sizeClasses[size], 'relative rounded-full overflow-hidden', className)}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-800 animate-pulse" />
      )}
      <img
        ref={imgRef}
        src={imageSrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
        alt={symbol || 'Token'}
        onError={handleError}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}