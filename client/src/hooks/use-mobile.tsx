import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile-sized
 * @returns boolean indicating if the viewport is mobile-sized
 */
export function useMobile() {
  const [isMobile, setIsMobile] = useState(
    // Default to checking window width if we're running in a client context
    typeof window !== 'undefined' ? window.innerWidth < 768 : false 
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    // Set on mount and add listener
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Remove listener on unmount
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}