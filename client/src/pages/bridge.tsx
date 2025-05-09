import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  ArrowDown, 
  Loader2, 
  RefreshCw, Wallet, 
  Info, 
  ExternalLink, 
  CheckCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from '@/lib/format';
import { TokenLogo } from '@/components/token-logo';

// Types for ChangeNow API responses
interface Currency {
  ticker: string;
  name: string;
  image: string;
  hasExternalId: boolean;
  isFiat: boolean;
  featured: boolean;
  isStable: boolean;
  supportsFixedRate: boolean;
  network?: string;
  tokenContract?: string;
  buy: boolean;
  sell: boolean;
}

interface ExchangeEstimate {
  fromAmount: string;
  toAmount: string;
  flow: string;
  rate: string;
  validUntil: string;
  transactionSpeedForecast: string;
  warningMessage?: string;
}

interface Transaction {
  id: string;
  status: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string;
  fromAddress: string;
  toAddress: string;
  payinAddress: string;
  payoutAddress: string;
  createdAt: string;
}

const Bridge = () => {
  const { toast } = useToast();
  const { isConnected, account } = useAuth();
  
  // Form state
  const [fromCurrency, setFromCurrency] = useState<string>('btc');
  const [toCurrency, setToCurrency] = useState<string>('eth');
  const [fromAmount, setFromAmount] = useState<string>('');
  const [estimatedAmount, setEstimatedAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  
  // UI state
  const [isSwapping, setIsSwapping] = useState(false);
  const [hasEstimated, setHasEstimated] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  
  // Get available currencies
  const { 
    data: currencies, 
    isLoading: isLoadingCurrencies,
    error: currenciesError
  } = useQuery({ 
    queryKey: ['/api/bridge/available-currencies'],
    refetchOnWindowFocus: false
  });
  
  // Set destination address to connected wallet by default
  useEffect(() => {
    if (isConnected && account) {
      setDestinationAddress(account);
    }
  }, [isConnected, account]);

  // Auto-refresh transaction status every 30 seconds
  useEffect(() => {
    if (!transactionId || activeStep !== 2) return;
    
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/bridge/transaction-status/${transactionId}`);
        
        if (!response.ok) {
          console.error('Failed to fetch transaction status');
          return;
        }
        
        const data = await response.json();
        setTransactionStatus(data.status);
      } catch (error) {
        console.error('Error fetching transaction status:', error);
      }
    };
    
    // Fetch immediately and then set interval
    fetchStatus();
    
    const intervalId = setInterval(fetchStatus, 30000); // 30 seconds
    
    return () => clearInterval(intervalId);
  }, [transactionId, activeStep]);
  
  // Estimate exchange
  const handleEstimateExchange = async () => {
    if (!fromCurrency || !toCurrency || !fromAmount || parseFloat(fromAmount) <= 0) {
      toast({
        title: "Missing information",
        description: "Please select currencies and enter a valid amount",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setHasEstimated(false);
      
      // First, let's check if we meet the minimum amount requirements
      const minResponse = await fetch('/api/bridge/min-amount', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromCurrency,
          toCurrency
        })
      });
      
      if (!minResponse.ok) {
        const error = await minResponse.json();
        throw new Error(error.error || 'Failed to get minimum amount');
      }
      
      const minData = await minResponse.json();
      const minAmount = minData.minAmount || 0;
      
      if (parseFloat(fromAmount) < minAmount) {
        toast({
          title: "Amount too low",
          description: `Minimum required amount is ${minAmount} ${fromCurrency.toUpperCase()}`,
          variant: "destructive"
        });
        return;
      }
      
      // Now get the exchange estimate
      const response = await fetch('/api/bridge/exchange-range', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromCurrency,
          toCurrency,
          fromAmount
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to estimate exchange');
      }
      
      const data: ExchangeEstimate = await response.json();
      
      if (data.toAmount === "0") {
        toast({
          title: "Invalid exchange",
          description: "Could not calculate exchange amount. Please try different currencies or amounts.",
          variant: "destructive"
        });
        return;
      }
      
      setEstimatedAmount(data.toAmount);
      setHasEstimated(true);
      
      toast({
        title: "Estimate updated",
        description: `You will receive approximately ${Number(data.toAmount).toFixed(6)} ${toCurrency.toUpperCase()}`,
      });
      
    } catch (error) {
      console.error('Error estimating exchange:', error);
      toast({
        title: "Estimation failed",
        description: error instanceof Error ? error.message : "Failed to estimate exchange",
        variant: "destructive"
      });
    }
  };
  
  // Create exchange transaction
  const handleCreateExchange = async () => {
    if (!fromCurrency || !toCurrency || !fromAmount || !destinationAddress) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSwapping(true);
      
      const response = await fetch('/api/bridge/create-exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromCurrency,
          toCurrency,
          fromAmount,
          toAmount: estimatedAmount,
          address: destinationAddress,
          // Include refund address if user is connected
          refundAddress: isConnected && account ? account : undefined
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create exchange');
      }
      
      const data: Transaction = await response.json();
      setTransactionId(data.id);
      setTransactionStatus(data.status);
      setActiveStep(2);
      
      toast({
        title: "Exchange created",
        description: `Successfully created exchange transaction ${data.id}`,
      });
      
    } catch (error) {
      console.error('Error creating exchange:', error);
      toast({
        title: "Exchange failed",
        description: error instanceof Error ? error.message : "Failed to create exchange transaction",
        variant: "destructive"
      });
    } finally {
      setIsSwapping(false);
    }
  };
  
  // Switch the from and to currencies
  const handleSwitchCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
    setFromAmount('');
    setEstimatedAmount('');
    setHasEstimated(false);
  };
  
  // Find currency details by ticker
  const getCurrencyDetails = (ticker: string): Currency | undefined => {
    if (!currencies || !Array.isArray(currencies)) return undefined;
    return currencies.find((c: Currency) => c.ticker.toLowerCase() === ticker.toLowerCase());
  };
  
  const fromCurrencyDetails = getCurrencyDetails(fromCurrency);
  const toCurrencyDetails = getCurrencyDetails(toCurrency);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Bridge</h1>
        <p className="text-muted-foreground mb-3">
          Easily exchange your assets across different networks with ChangeNOW integration. 
          No registration required, simple and fast.
        </p>
        
        <div className="mb-6 flex justify-end">
          <a 
            href="/bridge-widget" 
            className="text-sm text-primary hover:underline"
          >
            Try the ChangeNOW widget version →
          </a>
        </div>
        
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Crypto Exchange</CardTitle>
            <CardDescription>Secure, fast, and non-custodial exchanges</CardDescription>
          </CardHeader>
          
          <CardContent>
            {activeStep === 1 && (
              <div className="space-y-6">
                {/* From Currency */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium mb-1 text-white/80">From</label>
                    
                    {isConnected && (
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-xs text-primary" 
                        onClick={() => {
                          // In a real implementation, we would fetch user's balance
                          toast({
                            title: "Feature in development",
                            description: "Getting your balance will be available soon"
                          });
                        }}
                      >
                        <Wallet className="w-3 h-3 mr-1" />
                        Use max balance
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    <div className="w-full">
                      <Input 
                        type="number"
                        placeholder="0.00"
                        value={fromAmount}
                        onChange={(e) => {
                          setFromAmount(e.target.value);
                          setHasEstimated(false);
                        }}
                        className="glass-input bg-black/30 border border-white/15"
                      />
                    </div>
                    
                    {/* Simple Select Dropdown */}
                    <select
                      value={fromCurrency}
                      onChange={(e) => {
                        setFromCurrency(e.target.value);
                        setHasEstimated(false);
                      }}
                      className="w-[180px] glass-input bg-black/30 border border-white/15 rounded-md px-3 py-2 text-white"
                    >
                      {isLoadingCurrencies ? (
                        <option value="">Loading...</option>
                      ) : currencies && Array.isArray(currencies) ? (
                        currencies
                          .filter((c: Currency) => c.sell)
                          .map((currency: Currency) => (
                            <option 
                              key={currency.ticker} 
                              value={currency.ticker.toLowerCase()}
                            >
                              {currency.ticker.toUpperCase()} - {currency.name}
                            </option>
                          ))
                      ) : (
                        <option value="">No currencies available</option>
                      )}
                    </select>
                  </div>
                </div>
                
                {/* Switch Button */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSwitchCurrencies}
                    className="rounded-full bg-muted/50 hover:bg-muted w-10 h-10"
                  >
                    <ArrowDown className="h-5 w-5" />
                  </Button>
                </div>
                
                {/* To Currency */}
                <div className="space-y-2">
                  <label className="text-sm font-medium mb-1 text-white/80">To</label>
                  
                  <div className="flex space-x-2">
                    <div className="w-full">
                      <Input 
                        type="number"
                        placeholder="0.00"
                        value={estimatedAmount}
                        readOnly
                        className="glass-input bg-black/30 border border-white/15"
                      />
                    </div>
                    
                    {/* Simple Select Dropdown */}
                    <select
                      value={toCurrency}
                      onChange={(e) => {
                        setToCurrency(e.target.value);
                        setHasEstimated(false);
                      }}
                      className="w-[180px] glass-input bg-black/30 border border-white/15 rounded-md px-3 py-2 text-white"
                    >
                      {isLoadingCurrencies ? (
                        <option value="">Loading...</option>
                      ) : currencies && Array.isArray(currencies) ? (
                        currencies
                          .filter((c: Currency) => c.buy)
                          .map((currency: Currency) => (
                            <option 
                              key={currency.ticker} 
                              value={currency.ticker.toLowerCase()}
                            >
                              {currency.ticker.toUpperCase()} - {currency.name}
                            </option>
                          ))
                      ) : (
                        <option value="">No currencies available</option>
                      )}
                    </select>
                  </div>
                </div>
                
                {/* Destination Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium mb-1 text-white/80">
                    Destination Address
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 ml-1 inline cursor-pointer text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="glass-card bg-black/80 border border-white/10">
                          <p className="max-w-xs">
                            Make sure to provide a wallet address that supports the selected receiving currency.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  
                  <Input 
                    placeholder="Enter destination wallet address"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="glass-input bg-black/30 border border-white/15"
                  />
                </div>
              
                {/* Action Buttons */}
                <div className="flex flex-col md:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={handleEstimateExchange}
                    disabled={isLoadingCurrencies || !fromCurrency || !toCurrency || !fromAmount || parseFloat(fromAmount) <= 0}
                    className="flex-1"
                  >
                    {hasEstimated ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Estimate
                      </>
                    ) : (
                      'Get Estimate'
                    )}
                  </Button>
                  
                  <Button
                    onClick={handleCreateExchange}
                    disabled={
                      isSwapping || 
                      !hasEstimated || 
                      !fromCurrency || 
                      !toCurrency || 
                      !fromAmount || 
                      !destinationAddress
                    }
                    className="flex-1 pulse-gradient-border"
                  >
                    {isSwapping ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Exchange Now'
                    )}
                  </Button>
                </div>
              </div>
            )}
            
            {activeStep === 2 && transactionId && (
              <div className="space-y-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-center">Exchange Initiated!</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Transaction ID:</span>
                    <code className="text-sm bg-muted/20 px-2 py-1 rounded">{transactionId}</code>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={
                      transactionStatus === 'finished' ? 'text-green-500' : 
                      transactionStatus === 'failed' ? 'text-red-500' : 
                      'text-yellow-500'
                    }>
                      {transactionStatus ? transactionStatus.charAt(0).toUpperCase() + transactionStatus.slice(1) : 'Pending'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Exchange:</span>
                    <span>
                      {fromAmount} {fromCurrency.toUpperCase()} → {estimatedAmount} {toCurrency.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                <div className="pt-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Please follow the instructions from ChangeNOW to complete your exchange. 
                    You can check the status of your transaction on their website.
                  </p>
                  
                  <div className="flex flex-col space-y-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        window.open(`https://changenow.io/exchange/transactions/${transactionId}`, '_blank');
                      }}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on ChangeNOW
                    </Button>
                    
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/bridge/transaction-status/${transactionId}`);
                          
                          if (!response.ok) {
                            throw new Error('Failed to fetch transaction status');
                          }
                          
                          const data = await response.json();
                          setTransactionStatus(data.status);
                          
                          toast({
                            title: "Status updated",
                            description: `Transaction status: ${data.status}`
                          });
                        } catch (error) {
                          console.error('Error fetching transaction status:', error);
                          toast({
                            title: "Failed to update status",
                            description: "Could not fetch the latest transaction status",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Status
                    </Button>
                    
                    <Button
                      variant="link"
                      className="w-full"
                      onClick={() => {
                        setActiveStep(1);
                        setFromAmount('');
                        setEstimatedAmount('');
                        setHasEstimated(false);
                        setTransactionId(null);
                        setTransactionStatus(null);
                      }}
                    >
                      Start New Exchange
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col">
            <div className="text-xs text-muted-foreground mt-2">
              Powered by <a 
                href="https://changenow.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline"
              >
                ChangeNOW
              </a>. Exchange rates and availability subject to change.
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Bridge;