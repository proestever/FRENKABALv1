import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import ApiStats from '@/components/api-stats';
import HistoricalApiStats from '@/components/historical-api-stats';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';

// Admin wallet address (case-insensitive for comparison)
const ADMIN_WALLET_ADDRESS = '0x592139A3f8cf019f628A152FC1262B8aEf5B7199'.toLowerCase();

export default function AdminPage() {
  const { account, isConnected } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check if the connected wallet is the admin address
  useEffect(() => {
    if (account && account.toLowerCase() === ADMIN_WALLET_ADDRESS) {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
      
      // Show toast if wallet is connected but not authorized
      if (account) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin page.",
          variant: "destructive"
        });
      }
    }
  }, [account, toast]);

  // If not authorized, show access denied
  if (!account) {
    return (
      <main className="container mx-auto px-4 py-6">
        <Card className="border-white/10 p-6 shadow-lg max-w-2xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Admin Area</h1>
            <p className="text-white/60 mb-6">Please connect your wallet to access the admin page.</p>
            <Button onClick={() => setLocation('/')}>
              Return to Home
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="container mx-auto px-4 py-6">
        <Card className="border-red-500/20 p-6 shadow-lg max-w-2xl mx-auto">
          <div className="text-center">
            <div className="text-red-400 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p className="text-white/60 mb-6">Your wallet address does not have admin permissions.</p>
            <Button onClick={() => setLocation('/')}>
              Return to Home
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-6">
      <Card className="border-white/10 p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <Button variant="outline" onClick={() => setLocation('/')}>
            Return to Home
          </Button>
        </div>
        
        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-4">API Usage Statistics</h2>
            <Tabs defaultValue="current">
              <TabsList className="mb-4">
                <TabsTrigger value="current">Current Stats</TabsTrigger>
                <TabsTrigger value="historical">Historical Data</TabsTrigger>
              </TabsList>
              
              <TabsContent value="current">
                <ApiStats isAdmin={true} />
              </TabsContent>
              
              <TabsContent value="historical">
                <HistoricalApiStats />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </Card>
    </main>
  );
}