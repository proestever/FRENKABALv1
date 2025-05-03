import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRecentAddresses } from '@/lib/api';
import { truncateAddress } from '@/lib/utils';
import { Search } from 'lucide-react';

interface SearchSectionProps {
  onSearch: (address: string) => void;
  isLoading: boolean;
}

export function SearchSection({ onSearch, isLoading }: SearchSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const recentAddresses = getRecentAddresses();

  const handleSearch = () => {
    const trimmedAddress = searchQuery.trim();
    if (trimmedAddress) {
      onSearch(trimmedAddress);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleRecentAddressClick = (address: string) => {
    setSearchQuery(address);
    onSearch(address);
  };

  return (
    <section className="mb-8">
      <Card className="shadow-lg glass-card glass-highlight">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4 text-white">
            Track Any PulseChain Wallet
          </h2>
          
          <div className="relative">
            <Input
              type="text"
              placeholder="Enter PulseChain wallet address (0x...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pr-32 glass-card border-white/15 text-foreground bg-black/10"
              disabled={isLoading}
            />
            <div className="absolute right-1 top-1">
              <Button 
                onClick={handleSearch}
                disabled={isLoading || !searchQuery.trim()}
                className="relative glass-highlight overflow-hidden border border-transparent bg-gradient-to-r from-[rgba(255,0,150,0.8)] to-[rgba(0,150,255,0.8)] hover:opacity-90 text-white"
              >
                <div className="flex items-center">
                  <Search className="h-4 w-4 mr-1" />
                  <span>{isLoading ? 'Loading...' : 'Search'}</span>
                </div>
              </Button>
            </div>
          </div>
          
          {recentAddresses.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-x-2 text-sm text-muted-foreground flex-wrap">
                <span>Recent:</span>
                {recentAddresses.map((address) => (
                  <button
                    key={address}
                    onClick={() => handleRecentAddressClick(address)}
                    className="px-2 py-1 text-xs glass-card rounded-md hover:bg-black/20 transition text-white border-white/15"
                  >
                    {truncateAddress(address)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
