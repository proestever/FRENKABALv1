import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart } from '@/components/ui/area-chart';
import { formatDistanceToNow } from 'date-fns';
import { Wallet, CircleDollarSign, CreditCard, ReceiptText, History, Gift, AlertTriangle } from 'lucide-react';

interface CreditTransaction {
  id: number;
  userId: number;
  amount: number;
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  description: string | null;
  createdAt: string;
}

interface UserCredits {
  id: number;
  userId: number;
  balance: number;
  lifetimeCredits: number;
  lifetimeSpent: number;
  createdAt: string;
  updatedAt: string;
}

interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  plsCost: string;
  isActive: boolean;
  displayOrder: number;
}

const Credits: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('balance');
  const [txDetails, setTxDetails] = useState<string>('');
  
  // Fetch user credits
  const { 
    data: credits, 
    isLoading: isLoadingCredits,
    error: creditsError
  } = useQuery({
    queryKey: ['/api/users', user?.id, 'credits'],
    queryFn: () => apiRequest(`/api/users/${user?.id}/credits`),
    enabled: !!user?.id,
  });
  
  // Fetch credit transactions
  const { 
    data: transactions, 
    isLoading: isLoadingTransactions,
    error: transactionsError
  } = useQuery({
    queryKey: ['/api/users', user?.id, 'credit-transactions'],
    queryFn: () => apiRequest(`/api/users/${user?.id}/credit-transactions`),
    enabled: !!user?.id,
  });
  
  // Fetch available credit packages
  const { 
    data: packages, 
    isLoading: isLoadingPackages,
    error: packagesError
  } = useQuery({
    queryKey: ['/api/credit-packages'],
    queryFn: () => apiRequest('/api/credit-packages'),
  });
  
  // Mutation for recording a payment
  const recordPaymentMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/credit-payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'credits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'credit-transactions'] });
      toast({
        title: "Payment recorded",
        description: "Your payment has been recorded and is awaiting confirmation.",
      });
    },
    onError: (error) => {
      toast({
        title: "Payment failed",
        description: `Failed to record payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });
  
  // Function to initiate a PLS payment
  const initiatePayment = async (packageId: number, plsCost: string) => {
    if (!user?.id) {
      toast({
        title: "Authentication required",
        description: "Please connect your wallet to purchase credits.",
        variant: "destructive",
      });
      return;
    }
    
    // In a real implementation, you would:
    // 1. Generate a random transaction ID to track this payment
    // 2. Show the user the PLS address to send to
    // 3. Monitor for the transaction on the blockchain
    // 4. Call the backend to verify and process the payment
    
    // For now, we'll simulate a transaction hash
    const mockTxHash = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    setTxDetails(mockTxHash);
    
    // Get the connected wallet address
    const fromAddress = (window as any).ethereum?.selectedAddress || user.wallet;
    
    // Record the payment
    recordPaymentMutation.mutate({
      userId: user.id,
      packageId,
      txHash: mockTxHash,
      fromAddress,
      toAddress: '0x19aBE56AAe344f1e8F4B4B2eFe6B2b103169cE7D', // Example receiving address
      plsAmount: plsCost,
    });
  };
  
  // Determine if there's any error loading data
  const hasError = creditsError || transactionsError || packagesError;
  
  // Format transaction type for display
  const formatTransactionType = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'Purchase';
      case 'usage':
        return 'Usage';
      case 'admin_adjustment':
        return 'Admin Adjustment';
      case 'refund':
        return 'Refund';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Credits</h1>
        {credits ? (
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5" />
            <span className="font-bold">{credits.balance?.toLocaleString() || 0} Credits</span>
          </div>
        ) : isLoadingCredits ? (
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5" />
            <Skeleton className="h-6 w-20" />
          </div>
        ) : (
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5" />
            <span className="font-bold">0 Credits</span>
          </div>
        )}
      </div>
      
      {hasError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load credit data. Please try again later.
          </AlertDescription>
        </Alert>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="balance">Balance & Usage</TabsTrigger>
          <TabsTrigger value="purchase">Purchase Credits</TabsTrigger>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="balance" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Current Balance</CardTitle>
                <CardDescription>Available credits for searches</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCredits ? (
                  <Skeleton className="h-12 w-20" />
                ) : (
                  <div className="text-3xl font-bold flex items-center gap-2">
                    <CircleDollarSign className="h-6 w-6 text-primary" />
                    {credits && credits.balance ? credits.balance.toLocaleString() : '0'}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Purchased</CardTitle>
                <CardDescription>Lifetime credits acquired</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCredits ? (
                  <Skeleton className="h-12 w-20" />
                ) : (
                  <div className="text-3xl font-bold flex items-center gap-2">
                    <CreditCard className="h-6 w-6 text-primary" />
                    {credits && credits.lifetimeCredits ? credits.lifetimeCredits.toLocaleString() : '0'}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Used</CardTitle>
                <CardDescription>Lifetime credits spent</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCredits ? (
                  <Skeleton className="h-12 w-20" />
                ) : (
                  <div className="text-3xl font-bold flex items-center gap-2">
                    <ReceiptText className="h-6 w-6 text-primary" />
                    {credits && credits.lifetimeSpent ? credits.lifetimeSpent.toLocaleString() : '0'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Credit Usage Over Time</CardTitle>
              <CardDescription>Track your credit spending patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {/* We'd implement a real chart here with recharts or similar */}
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  Credit usage chart will be implemented here
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest credit activity</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : transactions && Array.isArray(transactions) && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 5).map((tx: CreditTransaction) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{formatTransactionType(tx.type)}</TableCell>
                        <TableCell className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </TableCell>
                        <TableCell>{tx.description || 'No description'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No recent transactions found
                </div>
              )}
            </CardContent>
            {transactions && Array.isArray(transactions) && transactions.length > 5 && (
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setActiveTab('history')}
                >
                  View All Transactions
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
        
        <TabsContent value="purchase" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Credits</CardTitle>
              <CardDescription>Buy credits using PulseChain (PLS)</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPackages ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : packages && Array.isArray(packages) && packages.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {packages.map((pkg: CreditPackage) => (
                    <Card key={pkg.id} className="border-2 hover:border-primary transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle>{pkg.name}</CardTitle>
                        <CardDescription>{pkg.credits ? pkg.credits.toLocaleString() : 0} Credits</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold mb-2">{pkg.plsCost ? parseInt(pkg.plsCost).toLocaleString() : 0} PLS</div>
                        <p className="text-sm text-muted-foreground">
                          That's {pkg.plsCost && pkg.credits ? (parseInt(pkg.plsCost) / pkg.credits).toFixed(4) : 0} PLS per credit
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button 
                          className="w-full" 
                          onClick={() => initiatePayment(pkg.id, pkg.plsCost)}
                          disabled={recordPaymentMutation.isPending}
                        >
                          {recordPaymentMutation.isPending ? 'Processing...' : 'Purchase'}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No credit packages available at this time
                </div>
              )}
              
              {txDetails && (
                <Alert className="mt-6">
                  <AlertTitle>Payment Recorded</AlertTitle>
                  <AlertDescription>
                    <p>Your payment has been recorded and is awaiting confirmation.</p>
                    <p className="mt-2"><strong>Transaction Hash:</strong> {txDetails}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Send the exact PLS amount to the provided address. Once confirmed, 
                      credits will be added to your account automatically.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-2">How to Buy Credits</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Select a credit package from the options above</li>
                  <li>Click "Purchase" to initiate the transaction</li>
                  <li>Send the exact PLS amount to the payment address</li>
                  <li>Wait for blockchain confirmation (typically 1-5 minutes)</li>
                  <li>Credits will be added to your account automatically</li>
                </ol>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Custom Amount</CardTitle>
              <CardDescription>Purchase a specific amount of credits</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Need a different amount? Contact us directly for custom credit packages.
              </p>
              <Button variant="outline">Contact Support</Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Complete record of your credit transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTransactions ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : transactions && Array.isArray(transactions) && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx: CreditTransaction) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{formatTransactionType(tx.type)}</TableCell>
                        <TableCell className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </TableCell>
                        <TableCell>{tx.description || 'No description'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No transaction history found
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Credits;