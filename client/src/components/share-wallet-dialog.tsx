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
            wallet={wallet} 
            portfolioName={portfolioName}
            tokens={tokens}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}