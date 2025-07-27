/**
 * Client-side PulseChain Scan API service
 * Makes API calls directly from the browser to distribute load
 */

interface ScannerToken {
  type: string;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    type: string;
  };
  value: string;
  token_id?: string;
}

interface ScannerApiResponse {
  items: ScannerToken[];
  next_page_params?: any;
}

const SCANNER_API_BASE = 'https://api.scan.pulsechain.com/api/v2';

/**
 * Fetch token balances directly from PulseChain Scan API
 * This runs in the browser, using the user's IP address
 */
export async function fetchTokenBalancesFromBrowser(
  address: string,
  retries = 3
): Promise<{
  tokens: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    balanceFormatted: number;
    verified?: boolean;
    isLp?: boolean;
  }>;
  plsBalance: number;
}> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching tokens from PulseChain Scan for ${address} (attempt ${attempt})`);
      
      const response = await fetch(`${SCANNER_API_BASE}/addresses/${address}/erc-20`, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = Math.min(1000 * attempt, 3000);
          console.log(`Rate limited, waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        if (response.status === 404) {
          // Address not found or has no tokens
          console.log(`No tokens found for address ${address}`);
          return { tokens: [], plsBalance: 0 };
        }
        
        throw new Error(`Scanner API error: ${response.status} ${response.statusText}`);
      }
      
      const data: ScannerApiResponse = await response.json();
      
      // Fetch native PLS balance
      let plsBalance = 0;
      try {
        const addressResponse = await fetch(`${SCANNER_API_BASE}/addresses/${address}`, {
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (addressResponse.ok) {
          const addressData = await addressResponse.json();
          plsBalance = parseFloat(addressData.exchange_rate) * parseFloat(addressData.coin_balance || '0');
        }
      } catch (error) {
        console.error('Error fetching PLS balance:', error);
      }
      
      // Transform scanner format to our format
      const tokens = data.items.map(item => {
        const balance = item.value || '0';
        const decimals = item.token.decimals || 18;
        const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
        
        // Check if it's an LP token
        const symbol = item.token.symbol || '';
        const name = item.token.name || '';
        const isLp = symbol.includes('PLP') || 
                     symbol.includes('-LP') || 
                     name.toLowerCase().includes('liquidity') ||
                     name.toLowerCase().includes('pulsex lp');
        
        return {
          address: item.token.address,
          symbol: symbol,
          name: name,
          decimals: decimals,
          balance: balance,
          balanceFormatted: balanceFormatted,
          verified: item.token.type === 'ERC-20',
          isLp: isLp,
          price: 0,
          value: 0
        };
      });
      
      // Add native PLS token if balance > 0
      if (plsBalance > 0) {
        tokens.unshift({
          address: 'native',
          symbol: 'PLS',
          name: 'PulseChain',
          decimals: 18,
          balance: (plsBalance * 1e18).toString(),
          balanceFormatted: plsBalance,
          verified: true,
          isLp: false,
          price: 0,
          value: 0
        });
      }
      
      console.log(`Found ${tokens.length} tokens for ${address}`);
      return { tokens, plsBalance };
      
    } catch (error) {
      lastError = error as Error;
      console.error(`Error fetching from scanner (attempt ${attempt}):`, error);
      
      if (attempt < retries) {
        const waitTime = Math.min(1000 * attempt, 3000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch token balances from scanner');
}

/**
 * Detect if a token is a liquidity pool token based on its properties
 */
export function detectLpToken(token: { symbol?: string; name?: string }): boolean {
  const symbol = token.symbol || '';
  const name = token.name || '';
  
  return symbol.includes('PLP') || 
         symbol.includes('-LP') || 
         name.toLowerCase().includes('liquidity') ||
         name.toLowerCase().includes('pulsex lp') ||
         name.toLowerCase().includes('dailp') ||
         name.toLowerCase().includes('hexlp') ||
         name.toLowerCase().includes('btclp');
}