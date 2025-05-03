import { useEffect, useState } from 'react';
import customTokenLogo from '../assets/100xfrenlogo.png';

const logoCache: Record<string, string> = {};

/**
 * Custom hook to fetch and cache token logos
 * @param tokenAddress The token contract address
 * @param fallbackLogo Optional fallback logo URL
 * @returns The token logo URL
 */
export function useTokenLogo(tokenAddress: string, fallbackLogo?: string): string {
  const [logoUrl, setLogoUrl] = useState<string>(fallbackLogo || customTokenLogo);
  
  useEffect(() => {
    // If this token is already in our cache, use it
    if (logoCache[tokenAddress]) {
      setLogoUrl(logoCache[tokenAddress]);
      return;
    }
    
    // Otherwise fetch from API
    const fetchLogo = async () => {
      try {
        const response = await fetch(`/api/token-logo/${tokenAddress}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.logoUrl) {
            // Add to cache for future use
            logoCache[tokenAddress] = data.logoUrl;
            setLogoUrl(data.logoUrl);
          }
        }
      } catch (error) {
        console.error(`Error fetching logo for ${tokenAddress}:`, error);
      }
    };
    
    fetchLogo();
  }, [tokenAddress, fallbackLogo]);
  
  return logoUrl;
}