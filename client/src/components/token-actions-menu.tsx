import { useState } from 'react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Copy, ExternalLink, Check, BarChart2, Search, Info } from 'lucide-react';
import { copyToClipboard, getTokenExternalLink } from '@/lib/utils';

interface TokenActionsMenuProps {
  children: React.ReactNode;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
}

export function TokenActionsMenu({ children, tokenAddress, tokenName, tokenSymbol }: TokenActionsMenuProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  
  const handleCopyAddress = async () => {
    const success = await copyToClipboard(tokenAddress);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExternalLink = (platform: 'dexscreener' | 'pulsechain' | 'otterscan') => {
    const url = getTokenExternalLink(tokenAddress, platform);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // For hover functionality
  const handleHoverStart = () => setOpen(true);
  const handleHoverEnd = () => setOpen(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild className="cursor-pointer focus:outline-none">
          <div>{children}</div>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-56 bg-black/90 border-white/10 backdrop-blur-md"
          sideOffset={5}
        >
          <DropdownMenuLabel className="font-bold text-gray-300">
            {tokenName} ({tokenSymbol})
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={handleCopyAddress}
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            <span>{copied ? 'Copied!' : 'Copy contract address'}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            View on:
          </DropdownMenuLabel>
          <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => openExternalLink('dexscreener')}
          >
            <BarChart2 size={16} className="text-green-500" />
            <span>DexScreener</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => openExternalLink('pulsechain')}
          >
            <Search size={16} className="text-blue-500" />
            <span>PulseChain Scan</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => openExternalLink('otterscan')}
          >
            <Info size={16} className="text-orange-500" />
            <span>OtterScan</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}