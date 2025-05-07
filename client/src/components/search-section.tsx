import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRecentAddresses } from '@/lib/api';
import { truncateAddress } from '@/lib/utils';
import { Search, X, Plus } from 'lucide-react';
import { FrenKabalLogo } from '@/components/frenklabal-logo';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SearchSectionProps {
  onSearch: (address: string) => void;
  onMultiSearch?: (addresses: string[]) => void;
  isLoading: boolean;
  hasSearched?: boolean;
  enableMultiSearch?: boolean;
  selectedAddresses?: string[];
}

export function SearchSection({ 
  onSearch, 
  onMultiSearch, 
  isLoading, 
  hasSearched = false,
  enableMultiSearch = true,
  selectedAddresses = []
}: SearchSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [multiSearchEnabled, setMultiSearchEnabled] = useState(false);
  const [addresses, setAddresses] = useState<string[]>(selectedAddresses);
  const recentAddresses = getRecentAddresses();
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle a standard search (single address)
  const handleSearch = () => {
    const trimmedAddress = searchQuery.trim();
    if (!trimmedAddress) return;

    if (multiSearchEnabled) {
      // Add to the list of addresses if not already included
      if (!addresses.some(addr => addr.toLowerCase() === trimmedAddress.toLowerCase())) {
        const newAddresses = [...addresses, trimmedAddress];
        setAddresses(newAddresses);
        setSearchQuery('');
        
        // Focus the input again for quick adding of multiple addresses
        setTimeout(() => inputRef.current?.focus(), 0);
        
        // If we have onMultiSearch, call it right away with the updated list
        if (onMultiSearch) {
          onMultiSearch(newAddresses);
        }
      }
    } else {
      // Regular single-address search
      onSearch(trimmedAddress);
    }
  };

  // KeyDown for the search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Recent address clicked
  const handleRecentAddressClick = (address: string) => {
    if (multiSearchEnabled) {
      // Add to multi-search list if not already there
      if (!addresses.some(addr => addr.toLowerCase() === address.toLowerCase())) {
        const newAddresses = [...addresses, address];
        setAddresses(newAddresses);
        
        // If we have onMultiSearch, call it right away
        if (onMultiSearch) {
          onMultiSearch(newAddresses);
        }
      }
    } else {
      // Regular single address search
      setSearchQuery(address);
      onSearch(address);
    }
  };
  
  // Remove an address from the multi-search list
  const removeAddress = (address: string) => {
    const newAddresses = addresses.filter(
      addr => addr.toLowerCase() !== address.toLowerCase()
    );
    setAddresses(newAddresses);
    
    // If we have onMultiSearch, call it with the updated list
    if (onMultiSearch) {
      onMultiSearch(newAddresses);
    }
  };
  
  // Toggle multi-search mode
  const toggleMultiSearch = () => {
    const newState = !multiSearchEnabled;
    setMultiSearchEnabled(newState);
    
    // If turning off multi-search with addresses, perform a search with the first address
    if (!newState && addresses.length > 0) {
      onSearch(addresses[0]);
    }
    
    // If turning on multi-search with a search query, add it to addresses
    if (newState && searchQuery.trim()) {
      const trimmedAddress = searchQuery.trim();
      setAddresses([trimmedAddress]);
      setSearchQuery('');
      
      // If we have onMultiSearch, call it with the address
      if (onMultiSearch) {
        onMultiSearch([trimmedAddress]);
      }
    }
  };

  // Multi-search toggle button
  const renderMultiSearchToggle = () => {
    if (!enableMultiSearch) return null;
    
    return (
      <div className="flex items-center gap-2 mt-3">
        <Toggle
          aria-label="Toggle multi-wallet search"
          pressed={multiSearchEnabled}
          onPressedChange={toggleMultiSearch}
          className={`${multiSearchEnabled ? 'bg-purple-500/20 text-purple-300' : ''}`}
        >
          <Plus className="h-4 w-4 mr-1" />
          Multi-wallet mode
        </Toggle>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-muted-foreground hover:text-white cursor-help">
                <span className="ml-1 text-xs">?</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="glass-card">
              <p className="text-xs max-w-xs">
                Search multiple wallet addresses at once to compare holdings and get combined statistics.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };
  
  // Renders the list of selected addresses in multi-search mode
  const renderSelectedAddresses = () => {
    if (!multiSearchEnabled || addresses.length === 0) return null;
    
    return (
      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {addresses.map(address => (
            <Badge 
              key={address} 
              variant="outline" 
              className="py-1 px-2 glass-card border-white/20 text-white group"
            >
              {truncateAddress(address)}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 rounded-full opacity-70 hover:opacity-100 hover:bg-white/10 p-0"
                onClick={() => removeAddress(address)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </div>
    );
  };

  // Search placeholder changes based on multi-search mode
  const getSearchPlaceholder = () => {
    if (multiSearchEnabled) {
      return addresses.length > 0 
        ? "Add another wallet address (0x...)" 
        : "Enter first wallet address (0x...)";
    }
    return "Enter PulseChain wallet address (0x...)";
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
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder={getSearchPlaceholder()}
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
            
            {renderMultiSearchToggle()}
            {renderSelectedAddresses()}
            
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
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder={getSearchPlaceholder()}
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
            
            <div className="flex flex-wrap gap-3 items-center">
              {renderMultiSearchToggle()}
              {renderSelectedAddresses()}
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }
}
