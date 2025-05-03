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
      <Card className="shadow-lg glass-card">
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
              className="w-full pr-10 glass-card border-white/15 text-foreground bg-black/10"
              disabled={isLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Button 
                onClick={handleSearch}
                disabled={isLoading || !searchQuery.trim()}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Search"
              >
                {isLoading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Search className="h-5 w-5 text-white" />
                )}
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
