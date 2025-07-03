import React from 'react';
import { Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BalanceMethodToggleProps {
  useTransferHistory: boolean;
  onToggle: (value: boolean) => void;
  isLoading?: boolean;
}

export function BalanceMethodToggle({ 
  useTransferHistory, 
  onToggle, 
  isLoading = false 
}: BalanceMethodToggleProps) {
  return (
    <div className="flex items-center space-x-3 p-4 bg-background/50 rounded-lg border border-border">
      <Switch
        id="balance-method"
        checked={useTransferHistory}
        onCheckedChange={onToggle}
        disabled={isLoading}
        className="data-[state=checked]:bg-primary"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Label 
            htmlFor="balance-method" 
            className="text-sm font-medium cursor-pointer"
          >
            Use Transfer History Calculation
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  <strong>Standard Method (Fast):</strong> Fetches current balances from blockchain APIs. Quick but may occasionally miss tokens or show outdated data.
                </p>
                <p className="text-sm mt-2">
                  <strong>Transfer History (Accurate):</strong> Calculates balances by analyzing complete on-chain transfer history. More accurate but slower, especially for active wallets.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {useTransferHistory 
            ? "Calculating from complete on-chain history (default - more accurate, slower)"
            : "Using API balances (faster, may be less accurate)"}
        </p>
      </div>
    </div>
  );
}