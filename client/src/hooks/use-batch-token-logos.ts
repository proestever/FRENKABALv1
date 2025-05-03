import { useState, useEffect } from 'react';

/**
 * Hook that fetches multiple token logos in a single batch request
 * This is much more efficient than individual requests for each token
 */
export function useBatchTokenLogos(addresses: string[], symbols?: string[]): Record<string, string> {
  console.log('Processing logo batch 1/1, size:', addresses.length);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    // Filter out empty/invalid addresses to avoid sending unnecessary requests
    const validAddresses = addresses.filter(address => !!address);
    
    if (validAddresses.length === 0) return;
    
    // Create a batch request to fetch all logos at once
    const fetchBatchLogos = async () => {
      try {
        const response = await fetch('/api/token-logos/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addresses: validAddresses,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch batch token logos');
        }
        
        const data = await response.json();
        
        // Extract logo URLs from the response
        const result: Record<string, string> = {};
        
        // Process the response data
        Object.entries(data).forEach(([address, value]: [string, any]) => {
          if (value && value.logoUrl) {
            // Normalize address to lowercase for consistent lookups
            result[address.toLowerCase()] = value.logoUrl;
          }
        });
        
        setLogoUrls(result);
      } catch (error) {
        console.error('Error fetching batch token logos:', error);
        
        // Create fallback logos for the addresses
        const fallbackUrls: Record<string, string> = {};
        validAddresses.forEach((address, index) => {
          // If we have a symbol for this address, use it
          const symbol = symbols && symbols[index] ? symbols[index] : null;
          
          // Special case for native token
          if (address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            fallbackUrls[address.toLowerCase()] = '/assets/pls-logo.png';
          } else if (symbol && ['pDAI', 'frpl'].includes(symbol)) {
            // Special case for Frenkabal tokens
            fallbackUrls[address.toLowerCase()] = '/assets/100xfrenlogo.png';
          } else {
            // Default to Frenkabal logo
            fallbackUrls[address.toLowerCase()] = '/assets/100xfrenlogo.png';
          }
        });
        
        setLogoUrls(fallbackUrls);
      }
    };
    
    fetchBatchLogos();
  }, [addresses, symbols]);

  return logoUrls;
}