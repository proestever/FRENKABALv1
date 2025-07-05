import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

interface ProgressiveWalletData extends Wallet {
  progressive?: boolean;
}

export function useProgressiveWallet(walletAddress: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrichedTokens, setEnrichedTokens] = useState<Map<string, any>>(new Map());
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  
  // Fetch basic token data immediately
  const {
    data: walletData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<ProgressiveWalletData>({
    queryKey: ['progressive-wallet', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet address');
      
      const response = await fetch(`/api/wallet/${walletAddress}/progressive`);
      if (!response.ok) {
        throw new Error('Failed to fetch wallet data');
      }
      
      return response.json();
    },
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
  
  // Enrich tokens progressively
  const enrichTokens = useCallback(async () => {
    if (!walletData?.tokens || walletData.tokens.length === 0) return;
    
    const tokensToEnrich = walletData.tokens.filter(token => 
      !enrichedTokens.has(token.address) && !token.price
    );
    
    if (tokensToEnrich.length === 0) {
      setEnrichmentProgress(100);
      return;
    }
    
    console.log(`Enriching ${tokensToEnrich.length} tokens progressively...`);
    
    // Process tokens one by one for immediate visual feedback
    let enrichedCount = 0;
    
    for (const token of tokensToEnrich) {
      try {
        const response = await fetch('/api/token/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        
        if (response.ok) {
          const enrichedToken = await response.json();
          setEnrichedTokens(prev => {
            const newMap = new Map(prev);
            newMap.set(token.address, enrichedToken);
            return newMap;
          });
        }
        
        enrichedCount++;
        setEnrichmentProgress(Math.round((enrichedCount / tokensToEnrich.length) * 100));
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to enrich token ${token.symbol}:`, error);
      }
    }
  }, [walletData, enrichedTokens]);
  
  // Start enrichment when basic data loads
  useEffect(() => {
    if (walletData?.tokens && walletData.progressive) {
      enrichTokens();
    }
  }, [walletData, enrichTokens]);
  
  // Combine basic data with enriched data
  const combinedWalletData = walletData ? {
    ...walletData,
    tokens: walletData.tokens.map(token => {
      const enriched = enrichedTokens.get(token.address);
      return enriched || token;
    }),
    totalValue: walletData.tokens.reduce((sum, token) => {
      const enriched = enrichedTokens.get(token.address);
      const value = enriched?.value || token.value || 0;
      return sum + value;
    }, 0)
  } : null;
  
  return {
    walletData: combinedWalletData,
    isLoading,
    isError,
    error,
    refetch,
    enrichmentProgress,
    isEnriching: enrichmentProgress > 0 && enrichmentProgress < 100
  };
}