import { useState } from 'react';
import { useSubscriptionPackages, useSubscriptionPayment, useUserActiveSubscription } from '@/hooks/use-subscription';
import { useWallet } from '@/hooks/use-wallet';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ethers } from 'ethers';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

// Hardcoded contract address for now
const CONTRACT_ADDRESS = "0x592139A3f8cf019f628A152FC1262B8aEf5B7199";

export default function SubscriptionPage() {
  const { user } = useAuth();
  const { walletAddress, provider } = useWallet();
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { data: packages, isLoading: isLoadingPackages } = useSubscriptionPackages();
  const { data: subscription, isLoading: isLoadingSubscription } = useUserActiveSubscription(user?.id || null);
  const subscriptionPayment = useSubscriptionPayment();

  // Check if user has an active subscription
  const hasActiveSubscription = subscription && 
    subscription.status === 'confirmed' && 
    new Date(subscription.endDate) > new Date();

  // Format PLS cost for display
  const formatPlsCost = (cost: string) => {
    const costBigNumber = ethers.utils.parseEther(cost);
    return ethers.utils.formatEther(costBigNumber);
  };

  // Handle subscription purchase
  const handleSubscribe = async (packageId: number, plsCost: string) => {
    if (!user || !walletAddress || !provider) {
      toast({
        title: "Error",
        description: "You must connect your wallet to subscribe",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Get signer from provider
      const signer = provider.getSigner();
      
      // Send PLS to contract address
      const tx = await signer.sendTransaction({
        to: CONTRACT_ADDRESS,
        value: ethers.utils.parseEther(plsCost)
      });
      
      // Wait for transaction to be mined
      await tx.wait();
      
      // Submit payment record to backend
      await subscriptionPayment.mutateAsync({
        userId: user.id,
        packageId: packageId,
        txHash: tx.hash,
        fromAddress: walletAddress,
        toAddress: CONTRACT_ADDRESS,
        plsAmount: plsCost
      });
      
      toast({
        title: "Success",
        description: "Subscription payment sent! It will be activated once confirmed."
      });
    } catch (error) {
      console.error("Transaction error:", error);
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setSelectedPackage(null);
    }
  };

  // While loading, show skeleton
  if (isLoadingPackages || isLoadingSubscription) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Subscription Plans</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="bg-gray-100 h-32"></CardHeader>
              <CardContent className="py-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Subscription Plans</h1>
        
        {hasActiveSubscription && subscription && (
          <Card className="p-4 border border-green-500 bg-green-50 dark:bg-green-900/20">
            <CardTitle className="text-lg text-green-700 dark:text-green-300">
              Active Subscription
            </CardTitle>
            <CardDescription>
              Your {subscription.package?.name} subscription is active until{' '}
              {format(new Date(subscription.endDate), 'PPP')}
            </CardDescription>
          </Card>
        )}
      </div>

      {packages && packages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{pkg.name}</CardTitle>
                  <Badge variant="outline">{pkg.durationDays} days</Badge>
                </div>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-3xl font-bold mb-4">
                  {formatPlsCost(pkg.plsCost)} PLS
                </p>
                <Separator className="my-4" />
                <h3 className="font-medium mb-2">Features:</h3>
                <ul className="space-y-2">
                  {pkg.features?.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      className="w-full"
                      onClick={() => setSelectedPackage(pkg.id)}
                      disabled={isProcessing || !walletAddress || hasActiveSubscription}
                    >
                      {!walletAddress ? 'Connect Wallet to Subscribe' : 
                       hasActiveSubscription ? 'Already Subscribed' : 
                       'Subscribe Now'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        You are about to subscribe to the {pkg.name} plan for {formatPlsCost(pkg.plsCost)} PLS.
                        <br /><br />
                        This will send a transaction from your wallet to our contract.
                        Once confirmed, your subscription will be active for {pkg.durationDays} days.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isProcessing}
                        onClick={(e) => {
                          e.preventDefault();
                          handleSubscribe(pkg.id, pkg.plsCost);
                        }}
                      >
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Payment
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold">No subscription packages available</h2>
          <p className="text-gray-500 mt-2">Please check back later for subscription options.</p>
        </div>
      )}
    </div>
  );
}