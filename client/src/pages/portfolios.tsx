import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/use-wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogTrigger, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { Separator } from '@/components/ui/separator';
import { PortfolioEmptyState } from '@/components/portfolio-empty-state';
import { Badge } from '@/components/ui/badge';

// Type definitions
interface Portfolio {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioAddress {
  id: number;
  portfolioId: number;
  walletAddress: string;
  label: string | null;
  createdAt: string;
}

const PortfoliosPage = () => {
  const { userId } = useWallet();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // State for new portfolio form
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioDescription, setNewPortfolioDescription] = useState('');
  
  // State for address dialog
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [newAddressLabel, setNewAddressLabel] = useState('');
  
  // Query portfolios
  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios', userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await apiRequest({
        url: `/api/users/${userId}/portfolios`,
        method: 'GET'
      });
      return await response.json() as Portfolio[];
    },
    enabled: !!userId,
  });

  // Query addresses for each portfolio
  const { data: portfolioAddresses } = useQuery({
    queryKey: ['portfolioAddresses', selectedPortfolio?.id],
    queryFn: async () => {
      if (!selectedPortfolio?.id) return [];
      const response = await apiRequest({
        url: `/api/portfolios/${selectedPortfolio.id}/addresses`,
        method: 'GET'
      });
      return await response.json() as PortfolioAddress[];
    },
    enabled: !!selectedPortfolio?.id,
  });

  // Create portfolio mutation
  const createPortfolioMutation = useMutation({
    mutationFn: async () => {
      const data = {
        userId,
        name: newPortfolioName,
        description: newPortfolioDescription || null,
      };
      return apiRequest({ 
        url: '/api/portfolios', 
        method: 'POST', 
        data 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios', userId] });
      setIsCreateDialogOpen(false);
      setNewPortfolioName('');
      setNewPortfolioDescription('');
      toast({
        title: 'Portfolio created',
        description: 'Your new portfolio has been created successfully.',
      });
    },
    onError: (error) => {
      console.error('Error creating portfolio:', error);
      toast({
        title: 'Failed to create portfolio',
        description: 'There was an error creating your portfolio. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete portfolio mutation
  const deletePortfolioMutation = useMutation({
    mutationFn: async (portfolioId: number) => {
      return apiRequest({ 
        url: `/api/portfolios/${portfolioId}`, 
        method: 'DELETE' 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios', userId] });
      toast({
        title: 'Portfolio deleted',
        description: 'Your portfolio has been deleted successfully.',
      });
    },
    onError: (error) => {
      console.error('Error deleting portfolio:', error);
      toast({
        title: 'Failed to delete portfolio',
        description: 'There was an error deleting your portfolio. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Add address to portfolio mutation
  const addAddressMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPortfolio) return null;
      
      const data = {
        walletAddress: newAddress,
        label: newAddressLabel || null,
      };
      
      return apiRequest({ 
        url: `/api/portfolios/${selectedPortfolio.id}/addresses`,
        method: 'POST', 
        data 
      });
    },
    onSuccess: () => {
      if (!selectedPortfolio) return;
      
      queryClient.invalidateQueries({ 
        queryKey: ['portfolioAddresses', selectedPortfolio.id] 
      });
      
      setIsAddressDialogOpen(false);
      setNewAddress('');
      setNewAddressLabel('');
      
      toast({
        title: 'Address added',
        description: 'The wallet address has been added to your portfolio.',
      });
    },
    onError: (error) => {
      console.error('Error adding address:', error);
      toast({
        title: 'Failed to add address',
        description: 'There was an error adding the address to your portfolio. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Remove address from portfolio mutation
  const removeAddressMutation = useMutation({
    mutationFn: async (addressId: number) => {
      return apiRequest({
        url: `/api/portfolio-addresses/${addressId}`,
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      if (!selectedPortfolio) return;
      
      queryClient.invalidateQueries({ 
        queryKey: ['portfolioAddresses', selectedPortfolio.id] 
      });
      
      toast({
        title: 'Address removed',
        description: 'The wallet address has been removed from your portfolio.',
      });
    },
    onError: (error) => {
      console.error('Error removing address:', error);
      toast({
        title: 'Failed to remove address',
        description: 'There was an error removing the address from your portfolio. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Generate a unique portfolio URL identifier
  const generatePortfolioUrlId = (portfolioId: number) => {
    // Combine portfolio ID with current date to create a unique string
    const timestamp = new Date().getTime();
    // Use only the last 6 digits for readability - still unique enough for our purposes
    const uniqueId = `${portfolioId}-${timestamp % 1000000}`;
    return uniqueId;
  };

  // Handler for portfolio search - load all addresses in portfolio and show combined view
  const handlePortfolioSearch = async (portfolioId: number, portfolioName: string) => {
    try {
      // Show loading toast
      toast({
        title: "Loading portfolio data",
        description: "Fetching data for all wallet addresses in this portfolio...",
      });
      
      // Get all wallet addresses in the portfolio
      const response = await apiRequest({
        url: `/api/portfolios/${portfolioId}/wallet-addresses`,
        method: 'GET'
      });
      
      const result = await response.json() as { 
        portfolioId: number;
        portfolioName: string;
        walletAddresses: string[] 
      };
      
      if (result && result.walletAddresses && result.walletAddresses.length > 0) {
        // Generate a unique identifier for this portfolio view
        const portfolioUrlId = generatePortfolioUrlId(portfolioId);
        
        // Navigate to the home page with the portfolio addresses as a combined search
        const addressesStr = result.walletAddresses.join(',');
        
        // Use setLocation to go to the home page with the portfolio addresses
        // Include portfolio ID, name and unique ID for deeplink capability
        setLocation(`/?addresses=${encodeURIComponent(addressesStr)}&portfolio=${portfolioId}&name=${encodeURIComponent(portfolioName)}&uid=${portfolioUrlId}`);
        
        // Show success toast
        toast({
          title: "Portfolio loaded",
          description: `Combined view of ${result.walletAddresses.length} wallet addresses`,
        });
      } else {
        toast({
          title: "No addresses found",
          description: "This portfolio doesn't have any wallet addresses to search.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error searching portfolio:", error);
      toast({
        title: "Error searching portfolio",
        description: "Unable to search wallet addresses in this portfolio.",
        variant: "destructive"
      });
    }
  };

  // Handle create portfolio form submission
  const handleCreatePortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) {
      toast({
        title: 'Portfolio name required',
        description: 'Please enter a name for your portfolio.',
        variant: 'destructive',
      });
      return;
    }
    
    createPortfolioMutation.mutate();
  };

  // Handle add address form submission
  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate ethereum address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(newAddress)) {
      toast({
        title: 'Invalid wallet address',
        description: 'Please enter a valid Ethereum wallet address.',
        variant: 'destructive',
      });
      return;
    }
    
    addAddressMutation.mutate();
  };

  // If user is not logged in, show message to connect wallet
  if (!userId) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">My Portfolios</h1>
        <Card>
          <CardContent className="pt-6">
            <PortfolioEmptyState
              title="Connect your wallet"
              description="You need to connect your wallet to view and manage your portfolios."
              icon="wallet"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Portfolios</h1>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Portfolio
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : portfolios && portfolios.length > 0 ? (
        <div className="w-full">
          {portfolios.map((portfolio) => (
            <div key={portfolio.id} className="mb-6">
              <Card className="w-full">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          if (selectedPortfolio?.id === portfolio.id) {
                            setSelectedPortfolio(null);
                          } else {
                            setSelectedPortfolio(portfolio);
                            // Also load the addresses
                            queryClient.prefetchQuery({
                              queryKey: ['portfolioAddresses', portfolio.id],
                              queryFn: async () => {
                                const response = await apiRequest({
                                  url: `/api/portfolios/${portfolio.id}/addresses`,
                                  method: 'GET'
                                });
                                return await response.json() as PortfolioAddress[];
                              }
                            });
                          }
                        }}
                      >
                        {selectedPortfolio?.id === portfolio.id ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        )}
                      </Button>
                      <div>
                        <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                        {portfolio.description && (
                          <CardDescription className="text-xs">{portfolio.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground mr-2">
                        Created {new Date(portfolio.createdAt).toLocaleDateString()}
                      </div>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPortfolio(portfolio);
                          handlePortfolioSearch(portfolio.id, portfolio.name);
                        }}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Search
                      </Button>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPortfolio(portfolio);
                          setIsAddressDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this portfolio?')) {
                            deletePortfolioMutation.mutate(portfolio.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {selectedPortfolio?.id === portfolio.id && (
                  <CardContent>
                    <div className="mt-2">
                      {portfolioAddresses && portfolioAddresses.length > 0 ? (
                        <div className="w-full border rounded-md overflow-hidden">
                          <table className="w-full table-auto">
                            <thead>
                              <tr className="bg-muted">
                                <th className="text-left py-2 px-4 text-sm font-medium">Wallet Address</th>
                                <th className="text-left py-2 px-4 text-sm font-medium">Label</th>
                                <th className="text-right py-2 px-4 text-sm font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {portfolioAddresses.map((address) => (
                                <tr key={address.id} className="border-t hover:bg-muted/50">
                                  <td className="py-2 px-4 text-sm font-mono">
                                    {address.walletAddress}
                                  </td>
                                  <td className="py-2 px-4 text-sm">
                                    {address.label ? (
                                      <Badge variant="outline" className="font-normal">
                                        {address.label}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-4 text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeAddressMutation.mutate(address.id)}
                                      disabled={removeAddressMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                          No addresses added yet. Click the "Add" button to add wallet addresses.
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <PortfolioEmptyState
              title="No portfolios found"
              description="Create a portfolio to save and organize wallet addresses for tracking."
              icon="folder"
            />
          </CardContent>
        </Card>
      )}

      {/* Create Portfolio Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Portfolio</DialogTitle>
            <DialogDescription>
              Create a collection of wallet addresses to track and analyze together.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePortfolio}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Portfolio Name</Label>
                <Input
                  id="name"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  placeholder="My PulseChain Portfolio"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={newPortfolioDescription}
                  onChange={(e) => setNewPortfolioDescription(e.target.value)}
                  placeholder="A collection of my main PulseChain wallets"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createPortfolioMutation.isPending}
              >
                {createPortfolioMutation.isPending ? 'Creating...' : 'Create Portfolio'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Address Dialog */}
      <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Wallet Address</DialogTitle>
            <DialogDescription>
              {selectedPortfolio ? `Add a wallet address to ${selectedPortfolio.name}` : 'Add a wallet address to your portfolio'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPortfolio && (
            <>
              <form onSubmit={handleAddAddress}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="walletAddress">Wallet Address</Label>
                    <Input
                      id="walletAddress"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="0x..."
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="label">Label (Optional)</Label>
                    <Input
                      id="label"
                      value={newAddressLabel}
                      onChange={(e) => setNewAddressLabel(e.target.value)}
                      placeholder="Main Wallet"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddressDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={addAddressMutation.isPending}
                  >
                    {addAddressMutation.isPending ? 'Adding...' : 'Add Address'}
                  </Button>
                </DialogFooter>
              </form>
              
              {portfolioAddresses && portfolioAddresses.length > 0 && (
                <div className="mt-4">
                  <Separator className="my-4" />
                  <h3 className="font-medium mb-3">Current Addresses</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {portfolioAddresses.map((address) => (
                      <div key={address.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium truncate max-w-[200px]">
                            {address.walletAddress}
                          </div>
                          {address.label && (
                            <Badge variant="outline" className="mt-1">
                              {address.label}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAddressMutation.mutate(address.id)}
                          disabled={removeAddressMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortfoliosPage;