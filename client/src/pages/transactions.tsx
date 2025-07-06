import { useParams, useLocation } from 'wouter';
import { TransactionHistory } from '@/components/transaction-history';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function TransactionsPage() {
  const { address } = useParams();
  const [, setLocation] = useLocation();
  
  if (!address) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">No wallet address provided</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-4">
        <Button 
          variant="ghost" 
          onClick={() => setLocation(`/${address}`)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Wallet
        </Button>
      </div>
      
      <TransactionHistory 
        walletAddress={address} 
        onClose={() => setLocation(`/${address}`)}
      />
    </div>
  );
}