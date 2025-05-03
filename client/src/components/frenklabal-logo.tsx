import frenkabalLogo from "../assets/frenklabal_logo.png";
import appLogo from "../assets/frenklabal_applogo-6_AgUeHs.png";

interface FrenKabalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  centered?: boolean;
  useAppLogo?: boolean;
}

export function FrenKabalLogo({ 
  size = 'md', 
  className = '', 
  centered = false,
  useAppLogo = false 
}: FrenKabalLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-32 h-32',
  };
  
  const centeredClass = centered ? 'mx-auto' : '';
  const logoSrc = useAppLogo ? appLogo : frenkabalLogo;
  
  return (
    <div className={`${sizeClasses[size]} ${centeredClass} ${className}`}>
      <img 
        src={logoSrc} 
        alt="FrenKabal Logo" 
        className="w-full h-full object-contain" 
      />
    </div>
  );
}