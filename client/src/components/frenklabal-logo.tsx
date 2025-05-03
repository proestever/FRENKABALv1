import frenkabalLogo from "../assets/frenklabal_logo.png";

interface FrenKabalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function FrenKabalLogo({ size = 'md', className = '' }: FrenKabalLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };
  
  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <img 
        src={frenkabalLogo} 
        alt="FrenKabal Logo" 
        className="w-full h-full object-contain" 
      />
    </div>
  );
}