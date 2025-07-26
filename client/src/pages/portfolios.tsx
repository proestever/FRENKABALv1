import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, ExternalLink, Copy, Pencil, ArrowDownAZ, Calendar, Hash, ArrowUpDown } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from '@/lib/queryClient';
import { Separator } from '@/components/ui/separator';
import { PortfolioEmptyState } from '@/components/portfolio-empty-state';
import { Badge } from '@/components/ui/badge';

// Type definitions
interface Portfolio {
  id: number;
  userId: number;
  name: string;
  slug: string | null;
  publicCode: string | null;
  description: string | null;
  isPublic: boolean;
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

// Define sort field and direction types
type SortField = 'name' | 'createdAt' | 'addressCount';
type SortDirection = 'asc' | 'desc';

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
  
  // State for edit address dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<PortfolioAddress | null>(null);
  const [editAddressLabel, setEditAddressLabel] = useState('');
  
  // State for portfolio sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [portfolioAddressCounts, setPortfolioAddressCounts] = useState<Record<number, number>>({});
  
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

  // Effect to fetch address counts for each portfolio - but more efficiently
  useEffect(() => {
    // Create a batched endpoint that returns all portfolio addresses counts in one request
    // instead of making separate calls for each portfolio
    const fetchAddressCounts = async () => {
      if (!portfolios || portfolios.length === 0) return;
      
      try {
        // Get first portfolio to check if we need to fetch anything
        const firstPortfolio = portfolios[0];
        if (!firstPortfolio) return;
        
        // If we only have one portfolio, use the existing separate endpoint
        if (portfolios.length === 1) {
          const response = await apiRequest({
            url: `/api/portfolios/${firstPortfolio.id}/addresses`,
            method: 'GET'
          });
          const addresses = await response.json() as PortfolioAddress[];
          setPortfolioAddressCounts({ [firstPortfolio.id]: addresses.length });
          return;
        }
        
        // Fetch address counts for multiple portfolios
        // Get only the data we need to show initially, then fetch more as needed
        const counts: Record<number, number> = {};
        
        // Only fetch for visible portfolios to reduce API usage
        const visiblePortfolios = portfolios.slice(0, 5); // First 5 portfolios
        
        // Sequential fetch to avoid overwhelming the server
        for (const portfolio of visiblePortfolios) {
          try {
            const response = await apiRequest({
              url: `/api/portfolios/${portfolio.id}/addresses`,
              method: 'GET'
            });
            const addresses = await response.json() as PortfolioAddress[];
            counts[portfolio.id] = addresses.length;
            
            // Update state after each fetch to show progress
            setPortfolioAddressCounts(prevCounts => ({
              ...prevCounts,
              [portfolio.id]: addresses.length
            }));
            
            // Pause briefly between requests (100ms) to reduce server load
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Error fetching addresses for portfolio ${portfolio.id}:`, error);
            counts[portfolio.id] = 0;
          }
        }
        

      } catch (error) {
        console.error('Error fetching portfolio address counts:', error);
      }
    };
    
    fetchAddressCounts();
  }, [portfolios]);

  // Function to toggle sort direction or change sort field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc'); // Default: name=ASC, others=DESC
    }
  };
  
  // Function to get sorted portfolios
  const getSortedPortfolios = () => {
    if (!portfolios) return [];
    
    return [...portfolios].sort((a, b) => {
      if (sortField === 'name') {
        const comparison = a.name.localeCompare(b.name);
        return sortDirection === 'asc' ? comparison : -comparison;
      } 
      else if (sortField === 'createdAt') {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        const comparison = aDate - bDate;
        return sortDirection === 'asc' ? comparison : -comparison;
      } 
      else if (sortField === 'addressCount') {
        const aCount = portfolioAddressCounts[a.id] || 0;
        const bCount = portfolioAddressCounts[b.id] || 0;
        const comparison = aCount - bCount;
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  };

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
  
  // Update address label mutation
  const updateAddressMutation = useMutation({
    mutationFn: async () => {
      if (!editingAddress) return null;
      
      const data = {
        label: editAddressLabel || null,
      };
      
      return apiRequest({ 
        url: `/api/portfolio-addresses/${editingAddress.id}`,
        method: 'PATCH', 
        data 
      });
    },
    onSuccess: () => {
      if (!selectedPortfolio) return;
      
      queryClient.invalidateQueries({ 
        queryKey: ['portfolioAddresses', selectedPortfolio.id] 
      });
      
      setIsEditDialogOpen(false);
      setEditingAddress(null);
      setEditAddressLabel('');
      
      toast({
        title: 'Address updated',
        description: 'The wallet address label has been updated.',
      });
    },
    onError: (error) => {
      console.error('Error updating address:', error);
      toast({
        title: 'Failed to update address',
        description: 'There was an error updating the address label. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handler for portfolio search - navigate directly to public URL
  const handlePortfolioSearch = async (portfolio: Portfolio) => {
    // If portfolio has a public code, navigate directly to the public URL
    if (portfolio.publicCode) {
      setLocation(`/p/${portfolio.publicCode}`);
      
      // Show navigation toast
      toast({
        title: "Opening portfolio",
        description: `Navigating to ${portfolio.name} Portfolio...`,
      });
    } else {
      // Fallback to old behavior if no public code
      toast({
        title: "Error",
        description: "This portfolio doesn't have a public code.",
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
  
  // Handle edit address button click
  const handleEditAddress = (address: PortfolioAddress) => {
    setEditingAddress(address);
    setEditAddressLabel(address.label || '');
    setIsEditDialogOpen(true);
  };
  
  // Handle edit address form submission
  const handleUpdateAddress = (e: React.FormEvent) => {
    e.preventDefault();
    updateAddressMutation.mutate();
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
      <div className="flex justify-between items-center mb-6 p-4 glass-card rounded-lg border border-white/15 shadow-lg">
        <h1 className="text-2xl font-bold text-white">My Portfolios</h1>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="glass-card border-white/15 bg-black/20 hover:bg-white/10">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Sort
                {sortField === 'name' && (
                  <span className="ml-1 text-xs">
                    (Name {sortDirection === 'asc' ? '↑' : '↓'})
                  </span>
                )}
                {sortField === 'createdAt' && (
                  <span className="ml-1 text-xs">
                    (Date {sortDirection === 'asc' ? '↑' : '↓'})
                  </span>
                )}
                {sortField === 'addressCount' && (
                  <span className="ml-1 text-xs">
                    (Addresses {sortDirection === 'asc' ? '↑' : '↓'})
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card border-white/15 bg-black/90">
              <DropdownMenuLabel>Sort Portfolios</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSort('name')} className="cursor-pointer">
                <ArrowDownAZ className="h-4 w-4 mr-2" />
                By Name
                {sortField === 'name' && (
                  <span className="ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort('createdAt')} className="cursor-pointer">
                <Calendar className="h-4 w-4 mr-2" />
                By Date Created
                {sortField === 'createdAt' && (
                  <span className="ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort('addressCount')} className="cursor-pointer">
                <Hash className="h-4 w-4 mr-2" />
                By Number of Addresses
                {sortField === 'addressCount' && (
                  <span className="ml-auto">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button onClick={() => setIsCreateDialogOpen(true)} className="glass-card border-white/15 bg-black/20 hover:bg-white/10">
            <Plus className="w-4 h-4 mr-2" />
            Create Portfolio
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : portfolios && portfolios.length > 0 ? (
        <div className="w-full">
          {getSortedPortfolios().map((portfolio) => (
            <div key={portfolio.id} className="mb-6">
              <Card className="w-full glass-card border border-white/15 shadow-lg bg-black/10">
                <CardHeader className="pb-2">
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center w-full pb-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 flex-shrink-0"
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
                      <div className="flex-1">
                        <CardTitle className="text-base lg:text-lg">{portfolio.name} Portfolio</CardTitle>
                        <CardDescription className="text-xs">Saved Bundle</CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 ml-10 lg:ml-0">
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(portfolio.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button 
                          className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white text-xs"
                          size="sm"
                          onClick={() => {
                            setSelectedPortfolio(portfolio);
                            handlePortfolioSearch(portfolio);
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Load Bundle
                        </Button>
                        <Button
                          className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white text-xs"
                          size="sm"
                          onClick={() => {
                            // Create the shareable URL using the public code
                            const portfolioUrl = portfolio.publicCode 
                              ? `${window.location.origin}/p/${portfolio.publicCode}`
                              : `${window.location.origin}/portfolio/${portfolio.id}`;
                            // Copy to clipboard
                            navigator.clipboard.writeText(portfolioUrl).then(() => {
                              toast({
                                title: "URL copied",
                                description: `Portfolio URL (${portfolio.publicCode || `ID: ${portfolio.id}`}) has been copied to clipboard`,
                              });
                            }).catch(err => {
                              console.error("Could not copy URL: ", err);
                              toast({
                                title: "Copy failed",
                                description: "Failed to copy URL to clipboard",
                                variant: "destructive"
                              });
                            });
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Share
                        </Button>
                        <Button 
                          className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white text-xs"
                          size="sm"
                          onClick={() => {
                            setSelectedPortfolio(portfolio);
                            setIsAddressDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                        <Button 
                          className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white text-xs"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this portfolio?')) {
                              deletePortfolioMutation.mutate(portfolio.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                {selectedPortfolio?.id === portfolio.id && (
                  <CardContent>
                    <div className="mt-2">
                      {portfolioAddresses && portfolioAddresses.length > 0 ? (
                        <div className="w-full glass-card border border-white/15 rounded-md overflow-hidden bg-black/10">
                          {/* Desktop view */}
                          <table className="hidden md:table w-full table-auto">
                            <thead>
                              <tr className="glass-card border-b border-white/10">
                                <th className="text-left py-2 px-4 text-sm font-medium text-white">Wallet Address</th>
                                <th className="text-left py-2 px-4 text-sm font-medium text-white">Label</th>
                                <th className="text-right py-2 px-4 text-sm font-medium text-white">Actions</th>
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
                                    <div className="flex justify-end space-x-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditAddress(address)}
                                        disabled={removeAddressMutation.isPending}
                                      >
                                        <Pencil className="h-4 w-4 text-primary" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeAddressMutation.mutate(address.id)}
                                        disabled={removeAddressMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          
                          {/* Mobile view */}
                          <div className="md:hidden space-y-2 p-2">
                            {portfolioAddresses.map((address) => (
                              <div key={address.id} className="glass-card border border-white/10 rounded-md p-3">
                                <div className="flex flex-col gap-2">
                                  <div className="font-mono text-xs break-all">
                                    {address.walletAddress}
                                  </div>
                                  {address.label && (
                                    <Badge variant="outline" className="font-normal self-start text-xs">
                                      {address.label}
                                    </Badge>
                                  )}
                                  <div className="flex justify-end gap-1 mt-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={() => handleEditAddress(address)}
                                      disabled={removeAddressMutation.isPending}
                                    >
                                      <Pencil className="h-3 w-3 text-primary" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={() => removeAddressMutation.mutate(address.id)}
                                      disabled={removeAddressMutation.isPending}
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
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
        <Card className="glass-card border border-white/15 shadow-lg bg-black/10">
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
                className="glass-card border-white/15 bg-black/20 hover:bg-white/10"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
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
                    className="glass-card border-white/15 bg-black/20 hover:bg-white/10"
                    onClick={() => setIsAddressDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
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
                      <div key={address.id} className="flex items-center justify-between p-2 glass-card border border-white/15 bg-black/10 shadow-sm rounded-md">
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-mono break-all">
                            {address.walletAddress}
                          </div>
                          {address.label && (
                            <Badge variant="outline" className="mt-1 text-xs self-start">
                              {address.label}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 flex-shrink-0 h-8 w-8 p-0"
                          onClick={() => removeAddressMutation.mutate(address.id)}
                          disabled={removeAddressMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
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
      
      {/* Edit Address Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Wallet Address</DialogTitle>
            <DialogDescription>
              Update the label for this wallet address.
            </DialogDescription>
          </DialogHeader>
          
          {editingAddress && (
            <form onSubmit={handleUpdateAddress}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="walletAddress">Wallet Address</Label>
                  <Input
                    id="walletAddress"
                    value={editingAddress.walletAddress}
                    disabled
                    className="font-mono text-sm opacity-70"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editLabel">Label (Optional)</Label>
                  <Input
                    id="editLabel"
                    value={editAddressLabel}
                    onChange={(e) => setEditAddressLabel(e.target.value)}
                    placeholder="Main Wallet"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="glass-card border-white/15 bg-black/20 hover:bg-white/10"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
                  disabled={updateAddressMutation.isPending}
                >
                  {updateAddressMutation.isPending ? 'Updating...' : 'Update Address'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortfoliosPage;