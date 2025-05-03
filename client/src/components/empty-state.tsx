import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface EmptyStateProps {
  onViewExample: () => void;
}

export function EmptyState({ onViewExample }: EmptyStateProps) {
  return (
    <Card className="p-8 text-center border-border shadow-lg backdrop-blur-sm bg-card/70">
      <div className="inline-block p-4 rounded-full bg-secondary/60 text-primary mb-4">
        <Search className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
        No Wallet Data
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Enter a PulseChain wallet address above to view token balances and portfolio value.
      </p>
      <Button 
        onClick={onViewExample}
        className="bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 transition"
      >
        View Example Wallet
      </Button>
    </Card>
  );
}
