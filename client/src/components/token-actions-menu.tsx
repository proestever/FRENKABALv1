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
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
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

  const calculateMenuPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const menuWidth = 224; // w-56 = 14rem = 224px
      const menuHeight = 300; // estimated max height
      
      // Position menu closer to the token element
      let top = rect.top + rect.height / 2;
      let left = rect.right + 8; // Position to the right of the token
      
      // If menu would go off right edge, position to the left
      if (left + menuWidth > windowWidth) {
        left = rect.left - menuWidth - 8;
      }
      
      // Ensure menu doesn't go off left edge
      if (left < 10) {
        left = 10;
      }
      
      // If menu would go off bottom, adjust up
      if (top + menuHeight > windowHeight) {
        top = windowHeight - menuHeight - 10;
      }
      
      // Ensure menu doesn't go off top
      if (top < 10) {
        top = 10;
      }
      
      setMenuPosition({ top, left });
    }
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    calculateMenuPosition();
    setShow(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShow(false);
    }, 300);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (show) {
      setShow(false);
    } else {
      calculateMenuPosition();
      setShow(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!show) {
      calculateMenuPosition();
      setShow(true);
    }
  };

  // Clean up timeout on unmount and handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [show]);

  return (
    <div 
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
    >
      <div className="cursor-pointer focus:outline-none">
        {children}
      </div>
      
      {show && (
        <div 
          className="fixed w-56 rounded-xl border border-white/10 bg-black/90 backdrop-blur-3xl py-2 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ 
            maxHeight: '300px',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 999999,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)'
          }}
        >
          <div className="px-3 py-1 font-bold text-white/90 text-shadow-sm">
            <div className="truncate max-w-[200px]">
              {tokenName} <span className="text-white/70">({tokenSymbol})</span>
            </div>
          </div>
          
          <div className="h-px bg-white/10 mb-2" />
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={handleCopyAddress}
          >
            <div className="flex-shrink-0">
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </div>
            <span className="truncate">{copied ? 'Copied!' : 'Copy contract address'}</span>
          </button>
          
          <div className="h-px bg-white/10 my-2" />
          
          <div className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
            View on:
          </div>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'dexscreener')}
          >
            <div className="flex-shrink-0">
              <BarChart2 size={16} className="text-green-500" />
            </div>
            <span className="truncate">DexScreener</span>
          </button>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'pulsechain')}
          >
            <div className="flex-shrink-0">
              <Search size={16} className="text-blue-500" />
            </div>
            <span className="truncate">PulseChain Scan</span>
          </button>
          
          <button 
            className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-[#111]/80 hover:backdrop-blur-sm transition-all duration-150 ease-in-out"
            onClick={(e) => openExternalLink(e, 'otterscan')}
          >
            <div className="flex-shrink-0">
              <Info size={16} className="text-orange-500" />
            </div>
            <span className="truncate">OtterScan</span>
          </button>
        </div>
      )}
    </div>
  );
}