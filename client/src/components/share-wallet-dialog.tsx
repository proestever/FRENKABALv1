import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wallet } from "@shared/schema";
import { ProcessedToken } from "server/types";
import { ShareWalletCard } from "./share-wallet-card";
import { useState, useEffect } from "react";
import { getHiddenTokens } from "@/lib/api";

// Helper function to ensure tokens conform to ProcessedToken interface
function ensureProcessedTokens(tokens: any[]): ProcessedToken[] {
  return tokens.map(token => ({
    address: token.address || '',
    symbol: token.symbol || '',
    name: token.name || '',
    decimals: token.decimals || 0,
    balance: token.balance || '0',
    balanceFormatted: token.balanceFormatted || 0,
    value: token.value || 0,
    price: token.price,
    priceChange24h: token.priceChange24h,
    logo: token.logo,
    exchange: token.exchange,
    verified: token.verified,
    securityScore: token.securityScore,
    isNative: token.isNative,
    isLp: token.isLp,
    lpToken0Symbol: token.lpToken0Symbol,
    lpToken1Symbol: token.lpToken1Symbol,
    lpToken0Name: token.lpToken0Name,
    lpToken1Name: token.lpToken1Name,
    lpToken0Address: token.lpToken0Address,
    lpToken1Address: token.lpToken1Address,
    lpToken0Decimals: token.lpToken0Decimals,
    lpToken1Decimals: token.lpToken1Decimals,
    lpToken0Balance: token.lpToken0Balance,
    lpToken1Balance: token.lpToken1Balance,
    lpToken0BalanceFormatted: token.lpToken0BalanceFormatted,
    lpToken1BalanceFormatted: token.lpToken1BalanceFormatted,
    lpToken0Price: token.lpToken0Price,
    lpToken1Price: token.lpToken1Price,
    lpToken0Value: token.lpToken0Value,
    lpToken1Value: token.lpToken1Value,
    lpTotalSupply: token.lpTotalSupply,
    lpReserve0: token.lpReserve0,
    lpReserve1: token.lpReserve1
  }));
}

interface ShareWalletDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: Wallet;
  portfolioName?: string;
  tokens: ProcessedToken[];
}

export function ShareWalletDialog({
  isOpen,
  onClose,
  wallet,
  portfolioName,
  tokens,
}: ShareWalletDialogProps) {
  const [hiddenTokens, setHiddenTokens] = useState<string[]>([]);
  const [visibleTokens, setVisibleTokens] = useState<ProcessedToken[]>([]);
  
  // Get hidden tokens on component mount
  useEffect(() => {
    setHiddenTokens(getHiddenTokens());
    
    // Listen for token visibility changes
    const handleTokenVisibilityChange = () => {
      setHiddenTokens(getHiddenTokens());
    };
    
    window.addEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('tokenVisibilityChanged', handleTokenVisibilityChange);
    };
  }, []);
  
  // Filter out hidden tokens when tokens or hiddenTokens change
  useEffect(() => {
    const filteredTokens = tokens.filter(token => 
      !hiddenTokens.includes(token.address)
    );
    
    setVisibleTokens(ensureProcessedTokens(filteredTokens));
  }, [tokens, hiddenTokens]);
  
  // Calculate visible wallet total
  const visibleTotal = visibleTokens.reduce((sum, token) => sum + (token.value || 0), 0);
  const visibleWallet = {
    ...wallet,
    totalValue: visibleTotal
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-background">
        <DialogHeader>
          <DialogTitle>Share Portfolio</DialogTitle>
          <DialogDescription>
            Download or share your portfolio to social media
          </DialogDescription>
        </DialogHeader>
        
        <div>
          <ShareWalletCard 
            wallet={visibleWallet} 
            portfolioName={portfolioName}
            tokens={visibleTokens}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}