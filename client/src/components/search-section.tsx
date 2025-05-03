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
    <section className="flex justify-center items-center mb-16 min-h-[60vh] pt-8">
      <Card className="shadow-lg glass-card max-w-md w-full mx-auto border border-white/25" style={{ boxShadow: '0 0 35px rgba(255, 255, 255, 0.12)' }}>
        <CardContent className="pt-8 pb-8 px-6">
          <h2 className="text-xl font-semibold mb-6 text-white text-center">
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
            <div className="mt-6">
              <div className="flex items-center justify-center gap-x-3 text-sm text-muted-foreground flex-wrap">
                <span className="opacity-70">Recent:</span>
                {recentAddresses.map((address) => (
                  <button
                    key={address}
                    onClick={() => handleRecentAddressClick(address)}
                    className="px-3 py-1.5 text-xs glass-card rounded-md hover:bg-white/5 transition text-white border-white/20"
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
