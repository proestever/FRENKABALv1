import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface EmptyStateProps {
  onViewExample: () => void;
}

export function EmptyState({ onViewExample }: EmptyStateProps) {
  return (
    <Card className="p-8 text-center">
      <div className="inline-block p-4 rounded-full bg-secondary-100 text-primary-500 mb-4">
        <Search className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-bold mb-2">No Wallet Data</h3>
      <p className="text-secondary-600 mb-6 max-w-md mx-auto">
        Enter a PulseChain wallet address above to view token balances and portfolio value.
      </p>
      <Button 
        variant="outline" 
        onClick={onViewExample}
        className="bg-secondary-200 text-secondary-700 hover:bg-secondary-300"
      >
        View Example Wallet
      </Button>
    </Card>
  );
}
