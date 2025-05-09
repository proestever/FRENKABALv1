import { useState, useEffect } from 'react';
import axios from 'axios';

type TokenLogoResponse = {
  id: number;
  tokenAddress: string;
  logoUrl: string;
  symbol: string | null;
  name: string | null;
  lastUpdated: string;
};

/**
 * A hook that fetches multiple token logos at once using the batch API
 * @param addresses Array of token addresses to fetch logos for
 * @returns Record mapping token addresses (lowercase) to logo URLs
 */
export const useBatchTokenLogos = (addresses: string[]): {
  logos: Record<string, string>;
  loading: boolean;
  error: Error | null;
} => {
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchLogos = async () => {
      if (!addresses || addresses.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Normalize addresses to lowercase
        const normalizedAddresses = addresses.map(addr => addr.toLowerCase());
        
        // Use the batch API to fetch multiple logos at once
        const response = await axios.post('/api/token-logos/batch', {
          addresses: normalizedAddresses
        });
        
        if (response.data) {
          // Convert the response to a Record mapping addresses to logo URLs
          const logoMap: Record<string, string> = {};
          
          // For each address in the response, extract the logo URL
          Object.entries(response.data).forEach(([address, data]) => {
            const logoData = data as TokenLogoResponse;
            if (logoData && logoData.logoUrl) {
              logoMap[address.toLowerCase()] = logoData.logoUrl;
            }
          });
          
          setLogos(logoMap);
        }
      } catch (err) {
        console.error('Error fetching batch token logos:', err);
        setError(err instanceof Error ? err : new Error('Unknown error fetching logos'));
      } finally {
        setLoading(false);
      }
    };

    fetchLogos();
  }, [addresses]);

  return { logos, loading, error };
};