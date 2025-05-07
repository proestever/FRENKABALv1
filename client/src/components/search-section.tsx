import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRecentAddresses } from '@/lib/api';
import { truncateAddress } from '@/lib/utils';
import { FrenKabalLogo } from '@/components/frenklabal-logo';

interface SearchSectionProps {
  onSearch: (address: string) => void;
  onMultiSearch?: (addresses: string[]) => void;
  isLoading: boolean;
  hasSearched?: boolean;
}

export function SearchSection({ onSearch, onMultiSearch, isLoading, hasSearched = false }: SearchSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const recentAddresses = getRecentAddresses();

  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    
    // Check if the input contains commas, which indicates multiple addresses
    if (trimmedQuery.includes(',') && onMultiSearch) {
      // Split by comma, trim each address, and filter out empty strings
      const addresses = trimmedQuery
        .split(',')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);
      
      if (addresses.length > 0) {
        onMultiSearch(addresses);
      }
    } else {
      // Single address search
      onSearch(trimmedQuery);
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

  // Different search bar layout based on whether a search has been performed
  if (!hasSearched) {
    // Initial layout with logo centered and narrow search card
    return (
      <section className="flex flex-col justify-center items-center mb-16 min-h-[60vh] pt-8 gap-10">
        <div className="logo-glow">
          <FrenKabalLogo useAppLogo size="2xl" centered />
        </div>
        <Card className="shadow-lg glass-card max-w-md w-full mx-auto border border-white/30 card-glitter">
          <CardContent className="pt-8 pb-8 px-6">
            <div>
              <div className="relative w-full">
                <Input
                  type="text"
                  placeholder="Enter PulseChain Address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full glass-card border-white/15 text-foreground bg-black/10 pr-10"
                  disabled={isLoading}
                />
                <div 
                  className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
                  onClick={searchQuery.trim() && !isLoading ? handleSearch : undefined}
                >
                  {isLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-white/70 ${!searchQuery.trim() ? 'opacity-50' : 'hover:text-white'}`}>
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  )}
                </div>
              </div>
            </div>
            
            {recentAddresses.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground flex-wrap">
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
  } else {
    // Compact search bar after a search has been performed
    return (
      <section className="mb-6">
        <Card className="shadow-lg glass-card w-full mx-auto border border-white/20">
          <CardContent className="py-4 px-6">
            <div>
              <div className="relative w-full">
                <Input
                  type="text"
                  placeholder="Enter PulseChain Address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full glass-card border-white/15 text-foreground bg-black/10 pr-10"
                  disabled={isLoading}
                />
                <div 
                  className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
                  onClick={searchQuery.trim() && !isLoading ? handleSearch : undefined}
                >
                  {isLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-white/70 ${!searchQuery.trim() ? 'opacity-50' : 'hover:text-white'}`}>
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }
}