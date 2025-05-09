import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ShareWalletCard } from '@/components/share-wallet-card';
import { Wallet } from '@shared/schema';
import { ProcessedToken } from 'server/types';

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
  tokens
}: ShareWalletDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-black/90 border-white/15">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Share your portfolio
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Download or share this snapshot of your portfolio to social media.
          </DialogDescription>
        </DialogHeader>
        
        <ShareWalletCard 
          wallet={wallet} 
          portfolioName={portfolioName}
          tokens={tokens}
        />
      </DialogContent>
    </Dialog>
  );
}