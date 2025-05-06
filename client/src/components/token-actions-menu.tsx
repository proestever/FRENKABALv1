import { useState, useRef, useEffect } from 'react';
import { Copy, Check, BarChart2, Search, Info } from 'lucide-react';
import { copyToClipboard, getTokenExternalLink } from '@/lib/utils';

interface TokenActionsMenuProps {
  children: React.ReactNode;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
}

export function TokenActionsMenu({ children, tokenAddress, tokenName, tokenSymbol }: TokenActionsMenuProps) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(tokenAddress);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExternalLink = (e: React.MouseEvent, platform: 'dexscreener' | 'pulsechain' | 'otterscan') => {
    e.stopPropagation();
    const url = getTokenExternalLink(tokenAddress, platform);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShow(false);
    }, 300);
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="cursor-pointer focus:outline-none">
        {children}
      </div>
      
      {show && (
        <div 
          className="absolute top-full left-0 mt-1 w-56 rounded-xl border border-white/10 bg-black/85 backdrop-blur-3xl py-2 shadow-xl z-50 animate-in fade-in-50 zoom-in-95 duration-150"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ maxHeight: '300px', transform: 'translateX(-10px)' }}
        >
          <div className="px-3 py-1 font-bold text-white/90 text-shadow-sm">
            {tokenName} <span className="text-white/70">({tokenSymbol})</span>
          </div>
          
          <div className="h-px bg-white/10 mb-2" />
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={handleCopyAddress}
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            <span>{copied ? 'Copied!' : 'Copy contract address'}</span>
          </button>
          
          <div className="h-px bg-white/10 my-2" />
          
          <div className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
            View on:
          </div>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'dexscreener')}
          >
            <BarChart2 size={16} className="text-green-500" />
            <span>DexScreener</span>
          </button>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'pulsechain')}
          >
            <Search size={16} className="text-blue-500" />
            <span>PulseChain Scan</span>
          </button>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'otterscan')}
          >
            <Info size={16} className="text-orange-500" />
            <span>OtterScan</span>
          </button>
        </div>
      )}
    </div>
  );
}