import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderIcon, WalletIcon } from 'lucide-react';
import React from 'react';

interface PortfolioEmptyStateProps {
  title: string;
  description: string;
  icon: 'folder' | 'wallet';
  actionLabel?: string;
  onAction?: () => void;
}

export function PortfolioEmptyState({ 
  title, 
  description, 
  icon, 
  actionLabel, 
  onAction 
}: PortfolioEmptyStateProps) {
  return (
    <Card className="p-8 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
      <div className="inline-block p-4 rounded-full bg-secondary/60 text-primary mb-4">
        {icon === 'folder' ? (
          <FolderIcon className="h-10 w-10" />
        ) : (
          <WalletIcon className="h-10 w-10" />
        )}
      </div>
      <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
        {title}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button 
          onClick={onAction}
          className="bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 transition"
        >
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}