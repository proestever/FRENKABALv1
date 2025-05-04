import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ProcessedToken } from '../../server/types';
import { TokenLogo } from './token-logo';
import { formatTokenAmount } from '@/lib/format';

interface ManualTokenEntryProps {
  walletAddress: string;
  onTokenAdded: (token: ProcessedToken) => void;
}

export function ManualTokenEntry({ walletAddress, onTokenAdded }: ManualTokenEntryProps) {
  const [tokenAddress, setTokenAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<ProcessedToken | null>(null);

  const handleTokenAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTokenAddress(e.target.value);
    setError(null);
  };

  const handleSearchToken = async () => {
    if (!tokenAddress || !tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError('Please enter a valid token address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/wallet/${walletAddress}/token/${tokenAddress}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Token not found or you have no balance of this token');
        } else {
          const errorData = await response.json();
          setError(errorData.message || 'Failed to fetch token data');
        }
        setToken(null);
        return;
      }
      
      const tokenData = await response.json();
      setToken(tokenData);
      onTokenAdded(tokenData);
    } catch (err) {
      console.error('Error fetching token:', err);
      setError('An error occurred while fetching the token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 glass-card border-white/15">
        <div className="space-y-2">
          <Label htmlFor="tokenAddress">Add Token By Address</Label>
          <div className="flex space-x-2">
            <Input
              id="tokenAddress"
              placeholder="0x..."
              value={tokenAddress}
              onChange={handleTokenAddressChange}
              className="bg-gray-800/50 border-white/10"
            />
            <Button 
              onClick={handleSearchToken}
              disabled={isLoading}
              className="whitespace-nowrap"
            >
              {isLoading ? 'Loading...' : 'Add Token'}
            </Button>
          </div>
          {error && (
            <p className="text-red-400 text-sm mt-1">{error}</p>
          )}
        </div>
        
        {token && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-md">
            <div className="flex items-center gap-2">
              <TokenLogo
                address={token.address}
                symbol={token.symbol}
                fallbackLogo={token.logo}
                size="sm"
              />
              <div>
                <h3 className="font-semibold">{token.name} ({token.symbol})</h3>
                <p className="text-sm text-muted-foreground">
                  {formatTokenAmount(token.balanceFormatted)} {token.symbol}
                  {token.price && ` • $${(token.balanceFormatted * token.price).toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}