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
import { Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

// FrenKabal donation/subscription address
const CONTRACT_ADDRESS = "0x87315173fC0B7A3766761C8d199B803697179434";

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

  // Format PLS cost for display (handling both with and without decimal formatting)
  const formatPlsCost = (cost: string) => {
    // If the cost already has decimal places, don't modify it
    return cost.includes('.') ? cost : ethers.utils.formatEther(ethers.utils.parseEther(cost));
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
      
      // Calculate exact amount to send in wei (handling formatted and non-formatted amounts)
      const weiAmount = plsCost.includes('.') 
        ? ethers.utils.parseEther(plsCost) 
        : ethers.utils.parseEther(plsCost);
      
      console.log(`Sending payment of ${plsCost} PLS (${weiAmount.toString()} wei) to ${CONTRACT_ADDRESS}`);
      
      // Send PLS to FrenKabal donation address
      const tx = await signer.sendTransaction({
        to: CONTRACT_ADDRESS,
        value: weiAmount
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
      
      const packageData = packages ? packages.find(p => p.id === packageId) : null;
      toast({
        title: "Payment Successful!",
        description: `You've purchased a ${packageData?.durationDays || ''}-day subscription for ${plsCost} PLS. Your access will be activated shortly.`
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
        <div className="flex flex-col gap-8">
          {/* Single card with subscription options */}
          <Card className="border border-cyan-200/30 backdrop-blur-sm bg-black/20">
            <CardHeader className="border-b border-cyan-200/20">
              <CardTitle>FrenKabal Premium Access</CardTitle>
              <CardDescription>
                Choose your subscription duration
              </CardDescription>
            </CardHeader>
            
            <div className="grid md:grid-cols-2 gap-6 p-6">
              {/* Features column */}
              <div>
                <h3 className="text-xl font-medium mb-4">All Plans Include:</h3>
                <ul className="space-y-3">
                  {packages[0].features?.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-cyan-400 mr-2 mt-1">
                        <Check className="h-5 w-5" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Pricing column */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 mb-4">
                  {packages.map((pkg) => (
                    <div 
                      key={pkg.id} 
                      className={`rounded-lg border cursor-pointer ${
                        selectedPackage === pkg.id
                          ? 'border-cyan-400 border-2'
                          : 'border-cyan-200/30'
                      } p-4 ${
                        pkg.durationDays === 365 
                          ? 'bg-gradient-to-r from-cyan-900/30 to-blue-900/30' 
                          : 'bg-black/30'
                      }`}
                      onClick={() => !hasActiveSubscription && setSelectedPackage(pkg.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{pkg.durationDays} Days</h4>
                          <p className="text-2xl font-bold text-cyan-100">{formatPlsCost(pkg.plsCost)} PLS</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {pkg.durationDays > 30 && (
                            <Badge className={`${
                              pkg.durationDays === 365 
                                ? 'bg-yellow-400/90 text-black' 
                                : 'bg-cyan-400/80 text-black'
                            } font-bold`}>
                              {pkg.durationDays === 365 
                                ? 'BEST VALUE! 33.3% OFF' 
                                : pkg.durationDays === 60 
                                  ? '10% OFF' 
                                  : '13.3% OFF'
                              }
                            </Badge>
                          )}
                          
                          {selectedPackage === pkg.id && (
                            <div className="h-5 w-5 rounded-full bg-cyan-400 flex items-center justify-center">
                              <Check className="h-4 w-4 text-black" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Subscribe button at the bottom */}
                {selectedPackage && (
                  <div className="relative mt-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="w-full bg-cyan-900/50 hover:bg-cyan-800/60 text-white border border-cyan-200/30 backdrop-blur-sm h-12 text-lg"
                          disabled={isProcessing || !walletAddress || hasActiveSubscription}
                        >
                          {!walletAddress 
                            ? 'Connect Wallet First' 
                            : hasActiveSubscription 
                              ? 'Already Subscribed' 
                              : `Subscribe to ${selectedPackage && packages.find(p => p.id === selectedPackage)?.durationDays}-Day Plan`}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Subscription</AlertDialogTitle>
                          <AlertDialogDescription>
                            {(() => {
                              const pkg = packages.find(p => p.id === selectedPackage);
                              if (!pkg) return null;
                              return (
                                <>
                                  You are about to subscribe to the {pkg.name} plan for {formatPlsCost(pkg.plsCost)} PLS.
                                  <br /><br />
                                  This will send a transaction from your wallet to our contract.
                                  Once confirmed, your subscription will be active for {pkg.durationDays} days.
                                </>
                              );
                            })()}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={isProcessing}
                            onClick={(e) => {
                              e.preventDefault();
                              if (selectedPackage) {
                                const pkg = packages.find(p => p.id === selectedPackage);
                                if (pkg) {
                                  handleSubscribe(pkg.id, pkg.plsCost);
                                }
                              }
                            }}
                          >
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Payment
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                
                {/* Button when no package is selected or wallet not connected */}
                {(!selectedPackage || !walletAddress) && (
                  <Button 
                    className="w-full mt-4 bg-cyan-900/50 hover:bg-cyan-800/60 text-white border border-cyan-200/30 backdrop-blur-sm h-12 text-lg"
                    disabled={!walletAddress}
                    onClick={() => {
                      if (!selectedPackage) {
                        toast({
                          title: "No Plan Selected",
                          description: "Please select a subscription plan first",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    {!walletAddress 
                      ? 'Connect Wallet to Subscribe' 
                      : 'Select a Plan to Subscribe'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
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